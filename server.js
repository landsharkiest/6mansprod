const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
    user: 'sixmansdb',
    host: 'database-1.ckb8wc0eyel2.us-east-1.rds.amazonaws.com',
    database: 'database-1',
    password: 'owenis57.',
    port: 5432,
});

async function initializeDatabase() {
    try {
        await pool.query(`
            create table if not exists clip_guesses (
                id serial primary key,
                video_key text not null,
                guessed_rank text not null,
                actual_rank text not null,
                is_correct boolean not null,
                created_at timestamp default current_timestamp
            )
        `);
        
        await pool.query(`
            create table if not exists video_stats (
                video_key text primary key,
                rank text not null,
                total_guesses integer default 0,
                correct_guesses integer default 0
            )
        `);
        
        console.log('database initialized');
    } catch (err) {
        console.error('database init error:', err);
    }
}

initializeDatabase();

app.post('/api/guesses', async (req, res) => {
    const { videoId, guessedRank, actualRank, isCorrect } = req.body;
    
    if (!videoId || !guessedRank || !actualRank) {
        return res.status(400).json({ error: 'missing required fields' });
    }
    
    try {
        const client = await pool.connect();
        
        try {
            await client.query('begin');
            
            await client.query(
                'insert into clip_guesses (video_key, guessed_rank, actual_rank, is_correct) values ($1, $2, $3, $4)',
                [videoId, guessedRank, actualRank, isCorrect]
            );
            
            const statsResult = await client.query(
                'select * from video_stats where video_key = $1',
                [videoId]
            );
            
            if (statsResult.rows.length > 0) {
                await client.query(
                    `update video_stats 
                     set total_guesses = total_guesses + 1, 
                         correct_guesses = correct_guesses + $1
                     where video_key = $2`,
                    [isCorrect ? 1 : 0, videoId]
                );
            } else {
                await client.query(
                    `insert into video_stats (video_key, rank, total_guesses, correct_guesses)
                     values ($1, $2, 1, $3)`,
                    [videoId, actualRank, isCorrect ? 1 : 0]
                );
            }
            
            await client.query('commit');
            res.status(200).json({ message: 'guess recorded' });
        } catch (error) {
            await client.query('rollback');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('error recording guess:', error);
        res.status(500).json({ error: 'failed to record guess' });
    }
});

app.get('/api/stats/video/:videoKey', async (req, res) => {
    const { videoKey } = req.params;
    
    try {
        const statsResult = await pool.query(
            'select * from video_stats where video_key = $1',
            [videoKey]
        );
        
        if (statsResult.rows.length === 0) {
            return res.status(404).json({ error: 'no stats found' });
        }
        
        const distributionResult = await pool.query(
            `select guessed_rank, count(*) as count
             from clip_guesses
             where video_key = $1
             group by guessed_rank
             order by count desc`,
            [videoKey]
        );
        
        const stats = statsResult.rows[0];
        const accuracy = stats.total_guesses > 0 
            ? (stats.correct_guesses / stats.total_guesses) * 100 
            : 0;
        
        res.json({
            videoKey: stats.video_key,
            rank: stats.rank,
            totalGuesses: stats.total_guesses,
            correctGuesses: stats.correct_guesses,
            accuracy: accuracy.toFixed(2),
            distribution: distributionResult.rows
        });
    } catch (error) {
        console.error('error fetching stats:', error);
        res.status(500).json({ error: 'failed to fetch stats' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const overallResult = await pool.query(
            `select 
               count(*) as total_guesses,
               sum(case when is_correct then 1 else 0 end) as correct_guesses
             from clip_guesses`
        );
        
        const rankStatsResult = await pool.query(
            `select 
               actual_rank,
               count(*) as total_guesses,
               sum(case when is_correct then 1 else 0 end) as correct_guesses
             from clip_guesses
             group by actual_rank
             order by actual_rank`
        );
        
        const mostGuessedResult = await pool.query(
            `select 
               guessed_rank,
               count(*) as count
             from clip_guesses
             group by guessed_rank
             order by count desc
             limit 5`
        );
        
        const overall = overallResult.rows[0];
        const accuracy = overall.total_guesses > 0 
            ? (overall.correct_guesses / overall.total_guesses) * 100 
            : 0;
        
        res.json({
            totalGuesses: parseInt(overall.total_guesses),
            correctGuesses: parseInt(overall.correct_guesses),
            accuracy: accuracy.toFixed(2),
            rankStats: rankStatsResult.rows,
            mostGuessedRanks: mostGuessedResult.rows
        });
    } catch (error) {
        console.error('error fetching stats:', error);
        res.status(500).json({ error: 'failed to fetch stats' });
    }
});

const port = process.env.port || 3001;
app.listen(port, () => {
    console.log(`server running on port ${port}`);
});