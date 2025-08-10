const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// In-memory fallback store for testing
const inMemoryStore = {
    guesses: [],
    stats: {}
};

// Flag to use in-memory store if database fails
let useInMemoryStore = false;

const pool = new Pool({
    user: 'sixmansdb',
    host: 'database-1.ckb8wc0eyel2.us-east-1.rds.amazonaws.com',
    database: 'database-1',
    password: 'Owenis57.',
    port: 5432,
});

async function initializeDatabase() {
    try {
        // Test connection first
        const client = await pool.connect();
        console.log('database connection successful');
        client.release();
        
        // Create tables
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
        
        console.log('database tables initialized');
        useInMemoryStore = false;
    } catch (err) {
        console.error('database connection/init error:', err);
        console.log('switching to in-memory store for development');
        useInMemoryStore = true;
    }
}

initializeDatabase();

app.post('/api/guesses', async (req, res) => {
    const { videoId, guessedRank, actualRank, isCorrect } = req.body;
    
    console.log('Received guess:', { videoId, guessedRank, actualRank, isCorrect });
    
    if (!videoId || !guessedRank || !actualRank) {
        console.log('Missing required fields');
        return res.status(400).json({ error: 'missing required fields' });
    }
    
    // Use in-memory store if database connection failed
    if (useInMemoryStore) {
        try {
            // Store the guess
            inMemoryStore.guesses.push({
                video_key: videoId,
                guessed_rank: guessedRank,
                actual_rank: actualRank,
                is_correct: isCorrect,
                created_at: new Date()
            });
            
            // Update stats
            if (!inMemoryStore.stats[videoId]) {
                inMemoryStore.stats[videoId] = {
                    video_key: videoId,
                    rank: actualRank,
                    total_guesses: 1,
                    correct_guesses: isCorrect ? 1 : 0
                };
            } else {
                inMemoryStore.stats[videoId].total_guesses += 1;
                if (isCorrect) {
                    inMemoryStore.stats[videoId].correct_guesses += 1;
                }
            }
            
            console.log('Guess recorded in memory store');
            return res.status(200).json({ 
                message: 'guess recorded (in-memory)', 
                mode: 'development' 
            });
        } catch (error) {
            console.error('Error with in-memory store:', error);
            return res.status(500).json({ 
                error: 'failed to record guess in memory', 
                details: error.message 
            });
        }
    }
    
    // Normal database flow
    try {
        const client = await pool.connect();
        console.log('Connected to database');
        
        
        try {
            await client.query('begin');
            
            await client.query(
                'insert into clip_guesses (video_key, guessed_rank, actual_rank, is_correct) values ($1, $2, $3, $4)',
                [videoId, guessedRank, actualRank, isCorrect]
            );
            console.log('Inserted guess into clip_guesses');
            
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
                console.log('Updated existing stats');
            } else {
                await client.query(
                    `insert into video_stats (video_key, rank, total_guesses, correct_guesses)
                     values ($1, $2, 1, $3)`,
                    [videoId, actualRank, isCorrect ? 1 : 0]
                );
                console.log('Inserted new stats');
            }
            
            await client.query('commit');
            console.log('Transaction committed successfully');
            res.status(200).json({ message: 'guess recorded' });
        } catch (error) {
            await client.query('rollback');
            console.error('Database error (rolling back):', error.message);
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error recording guess:', error);
        res.status(500).json({ error: 'failed to record guess', details: error.message });
    }
});

app.get('/api/stats/video/:videoKey', async (req, res) => {
    const { videoKey } = req.params;
    
    // Use in-memory store if database connection failed
    if (useInMemoryStore) {
        const stats = inMemoryStore.stats[videoKey];
        if (!stats) {
            return res.status(404).json({ error: 'no stats found (in-memory)' });
        }
        
        // Calculate distribution
        const distribution = {};
        inMemoryStore.guesses
            .filter(g => g.video_key === videoKey)
            .forEach(g => {
                distribution[g.guessed_rank] = (distribution[g.guessed_rank] || 0) + 1;
            });
        
        const distributionArray = Object.entries(distribution).map(([guessed_rank, count]) => ({
            guessed_rank,
            count
        }));
        
        const accuracy = stats.total_guesses > 0 
            ? (stats.correct_guesses / stats.total_guesses) * 100 
            : 0;
        
        return res.json({
            videoKey: stats.video_key,
            rank: stats.rank,
            totalGuesses: stats.total_guesses,
            correctGuesses: stats.correct_guesses,
            accuracy: accuracy.toFixed(2),
            distribution: distributionArray,
            mode: 'development'
        });
    }
    
    // Normal database flow
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

// Simple test endpoint
app.get('/api/test', async (req, res) => {
    try {
        // Test database connection
        const client = await pool.connect();
        console.log('Database connection test successful');
        
        // Test simple query
        const result = await client.query('SELECT NOW() as current_time');
        client.release();
        
        res.json({
            status: 'success',
            message: 'Server is running correctly',
            dbConnection: 'success',
            serverTime: result.rows[0].current_time
        });
    } catch (error) {
        console.error('Test endpoint error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Server error',
            dbConnection: 'failed',
            error: error.message
        });
    }
});

const port = process.env.port || 3001;
app.listen(port, () => {
    console.log(`server running on port ${port}`);
    console.log('- POST /api/guesses - record a new guess');
    console.log('- GET /api/stats/video/:videoKey - get stats for a video');
    console.log('- GET /api/stats - get overall stats');
});