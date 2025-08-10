import React, { useEffect, useState } from 'react';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import './Play.css';

function Play() {
  const REGION = "us-east-1";
  const BUCKET = "6mans-clip-bucket";
  const IDENTITY_POOL_ID = "us-east-1:21355927-0f08-488d-9e3c-446b36007857"; // pool id from AWS Cognito

  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGuessRank, setShowGuessRank] = useState(false);
  const [videoKey, setVideoKey] = useState(null);
  const [actualRank, setActualRank] = useState(null);
  const [guessResult, setGuessResult] = useState(null);
  const [guessStats, setGuessStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    async function fetchVideos() {
      const s3Client = new S3Client({
        region: REGION,
        credentials: fromCognitoIdentityPool({
          clientConfig: { region: REGION },
          identityPoolId: IDENTITY_POOL_ID,
        }),
      });
      try {
        const command = new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: 'verified/'
        });
        const data = await s3Client.send(command);
        const files = (data.Contents || []).filter(obj => obj.Key.endsWith('.mp4') || obj.Key.endsWith('.webm') || obj.Key.endsWith('.mov'));
        if (files.length > 0) {
          const randomIndex = Math.floor(Math.random() * files.length);
          const randomFile = files[randomIndex].Key;
          
          // Extract the rank from the filename (assuming format like "S_filename.mp4")
          const filenameParts = randomFile.split('/');
          const filename = filenameParts[filenameParts.length - 1];
          const rank = filename.split('_')[0];
          
          setActualRank(rank);
          setVideoKey(randomFile);
          const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${randomFile}`;
          setVideoUrl(url);
        }
      } catch (err) {
        console.error('Error fetching videos:', err);
      }
      setLoading(false);
    }
    fetchVideos();
  }, []);

  const handleGuessSubmit = async (guessedRank) => {
    // Compare the guessed rank with the actual rank
    const isCorrect = guessedRank === actualRank;
    setGuessResult({
      correct: isCorrect,
      guessedRank,
      actualRank
    });

    // Save the guess to the database
    if (videoKey) {
      try {
        setLoadingStats(true);
        const response = await fetch('/api/guesses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoId: videoKey,
            guessedRank,
            actualRank,
            isCorrect
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save guess');
        }
        
        // Fetch statistics for this video
        const statsResponse = await fetch(`/api/stats/video/${encodeURIComponent(videoKey)}`);
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setGuessStats(statsData);
        } else {
          console.error('Failed to fetch video stats');
        }
        
        setLoadingStats(false);
        console.log('Guess saved successfully');
      } catch (error) {
        console.error('Error saving guess:', error);
        setLoadingStats(false);
      }
    }
  };

  const handlePlayAgain = () => {
    setGuessResult(null);
    setShowGuessRank(false);
    setLoading(true);
    setVideoUrl(null);
    setGuessStats(null);
    
    // Fetch a new random video
    async function fetchVideos() {
      const s3Client = new S3Client({
        region: REGION,
        credentials: fromCognitoIdentityPool({
          clientConfig: { region: REGION },
          identityPoolId: IDENTITY_POOL_ID,
        }),
      });
      try {
        const command = new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: 'verified/'
        });
        const data = await s3Client.send(command);
        const files = (data.Contents || []).filter(obj => obj.Key.endsWith('.mp4') || obj.Key.endsWith('.webm') || obj.Key.endsWith('.mov'));
        if (files.length > 0) {
          const randomIndex = Math.floor(Math.random() * files.length);
          const randomFile = files[randomIndex].Key;
          
          // Extract the rank from the filename
          const filenameParts = randomFile.split('/');
          const filename = filenameParts[filenameParts.length - 1];
          const rank = filename.split('_')[0];
          
          setActualRank(rank);
          setVideoKey(randomFile);
          const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${randomFile}`;
          setVideoUrl(url);
        }
      } catch (err) {
        console.error('Error fetching videos:', err);
      }
      setLoading(false);
    }
    fetchVideos();
  };

  return (
    <div className="Play">
      {loading ? (
        <p>Loading...</p>
      ) : videoUrl ? (
        <div className="video-container">
          <video
            width="720"
            controls
            autoPlay
            onEnded={() => setShowGuessRank(true)}
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {showGuessRank && !guessResult && (
            <GuessRank onGuess={handleGuessSubmit} />
          )}
          
          {guessResult && (
            <div className="guess-result" style={{ marginTop: '20px', textAlign: 'center' }}>
              <h2 style={{ color: guessResult.correct ? 'green' : 'red' }}>
                {guessResult.correct ? 'Correct!' : 'Incorrect!'}
              </h2>
              <p>You guessed: {guessResult.guessedRank}</p>
              <p>Actual rank: {guessResult.actualRank}</p>
              
              {loadingStats ? (
                <p>Loading statistics...</p>
              ) : guessStats ? (
                <div className="stats-container">
                  <h3>Guess Distribution</h3>
                  <GuessDistribution stats={guessStats} />
                  <p>Total guesses: {guessStats.totalGuesses}</p>
                  <p>Correct percentage: {guessStats.accuracy}%</p>
                </div>
              ) : null}
              
              <button 
                onClick={handlePlayAgain}
                style={{ 
                  margin: '20px 0', 
                  padding: '12px 24px', 
                  fontSize: '1.2em',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Play Another Clip
              </button>
            </div>
          )}
        </div>
      ) : (
        <p>No verified videos found.</p>
      )}
    </div>
  );
}

function GuessRank({ onGuess }) {
  const ranks = ["S", "X", "A", "B+", "B", "C", "D", "E", "H"];
  return (
    <div className="GuessRank" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: '24px' }}>
      <h3 style={{ width: '100%', textAlign: 'center', marginBottom: '16px' }}>Guess the rank of this gameplay:</h3>
      {ranks.map(rank => (
        <button
          key={rank}
          className="GuessRank-button"
          style={{ 
            margin: '0 8px 16px', 
            padding: '12px 24px', 
            fontSize: '1.2em',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'background-color 0.3s'
          }}
          onClick={() => onGuess(rank)}
          onMouseOver={(e) => e.target.style.backgroundColor = '#0b7dda'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#2196F3'}
        >
          {rank}
        </button>
      ))}
    </div>
  );
}

function GuessDistribution({ stats }) {
  // Get all possible ranks
  const allRanks = ["S", "X", "A", "B+", "B", "C", "D", "E", "H"];
  
  // Create a map of all ranks with counts (including zeros for ranks with no guesses)
  const distributionMap = {};
  allRanks.forEach(rank => {
    distributionMap[rank] = 0;
  });
  
  // Fill in the actual counts
  if (stats.distribution) {
    stats.distribution.forEach(item => {
      distributionMap[item.guessed_rank] = parseInt(item.count);
    });
  }
  
  // Calculate the highest count for scaling
  const maxCount = Math.max(...Object.values(distributionMap), 1);
  
  // Generate bar colors based on the actual rank
  const getBarColor = (rank) => {
    if (rank === stats.rank) {
      return '#4CAF50'; // Green for correct rank
    }
    return '#2196F3'; // Blue for other ranks
  };
  
  return (
    <div className="guess-distribution">
      {allRanks.map(rank => {
        const count = distributionMap[rank] || 0;
        const percentage = stats.totalGuesses > 0 
          ? Math.round((count / stats.totalGuesses) * 100) 
          : 0;
        const barWidth = Math.max((percentage / 100) * 100, percentage > 0 ? 5 : 0); // Minimum 5% width if there are any guesses
        
        return (
          <div key={rank} className="distribution-row" style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
            <div className="rank-label" style={{ width: '40px', textAlign: 'right', marginRight: '10px' }}>
              {rank}
            </div>
            <div 
              className="bar" 
              style={{ 
                width: `${barWidth}%`, 
                backgroundColor: getBarColor(rank),
                height: '24px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                color: 'white',
                paddingRight: '8px',
                transition: 'width 1s ease-in-out',
                minWidth: count > 0 ? '40px' : '0',
                position: 'relative'
              }}
            >
              {count > 0 && (
                <span style={{ position: 'absolute', right: '8px' }}>
                  {percentage}%
                </span>
              )}
            </div>
            <div className="count-label" style={{ marginLeft: '10px', minWidth: '30px' }}>
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Play;