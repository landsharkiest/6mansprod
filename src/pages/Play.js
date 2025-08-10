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
  const [videoKey, setVideoKey] = useState(null);
  const [actualRank, setActualRank] = useState(null);
  const [guessResult, setGuessResult] = useState(null);
  const [guessStats, setGuessStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Helper function to store guesses locally
  const storeGuessLocally = (videoKey, guessedRank, actualRank, isCorrect) => {
    try {
      // Get existing guesses from localStorage
      const localGuessesString = localStorage.getItem('6mansGuesses') || '[]';
      const localGuesses = JSON.parse(localGuessesString);
      
      // Add new guess
      localGuesses.push({
        videoKey,
        guessedRank,
        actualRank,
        isCorrect,
        timestamp: new Date().toISOString()
      });
      
      // Save back to localStorage
      localStorage.setItem('6mansGuesses', JSON.stringify(localGuesses));
      console.log('Guess saved locally');
    } catch (error) {
      console.error('Failed to save guess locally:', error);
    }
  };
  
  // Helper function to generate mock stats from local storage
  const generateMockStats = (videoKey) => {
    try {
      const localGuessesString = localStorage.getItem('6mansGuesses') || '[]';
      const localGuesses = JSON.parse(localGuessesString);
      
      // Filter guesses for this video
      const videoGuesses = localGuesses.filter(g => g.videoKey === videoKey);
      
      // Count by guessed rank
      const distribution = {};
      videoGuesses.forEach(g => {
        distribution[g.guessedRank] = (distribution[g.guessedRank] || 0) + 1;
      });
      
      // Format distribution for the chart
      const formattedDistribution = Object.entries(distribution).map(([guessedRank, count]) => ({
        guessed_rank: guessedRank,
        count
      }));
      
      // Count correct guesses
      const correctGuesses = videoGuesses.filter(g => g.isCorrect).length;
      
      return {
        videoKey,
        rank: actualRank,
        totalGuesses: videoGuesses.length,
        correctGuesses,
        accuracy: videoGuesses.length > 0 
          ? ((correctGuesses / videoGuesses.length) * 100).toFixed(2) 
          : "0.00",
        distribution: formattedDistribution,
        source: 'local' // Indicate this is local data
      };
    } catch (error) {
      console.error('Failed to generate mock stats:', error);
      return {
        videoKey,
        rank: actualRank,
        totalGuesses: 0,
        correctGuesses: 0,
        accuracy: "0.00",
        distribution: [],
        source: 'local'
      };
    }
  };

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
        console.log('Sending guess to server:', { videoId: videoKey, guessedRank, actualRank, isCorrect });
        
        // Store guess locally regardless of server availability
        // This ensures the user experience isn't broken even if the server is down
        storeGuessLocally(videoKey, guessedRank, actualRank, isCorrect);
        
        try {
          const SERVER_URL = 'http://localhost:3001'; // Direct server URL
          
          const response = await fetch(`${SERVER_URL}/api/guesses`, {
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

          // Safely parse JSON response
          const responseData = await response.json();
          
          if (response.ok) {
            console.log('Guess saved successfully:', responseData);
            
            // Try to fetch statistics for this video
            try {
              console.log('Fetching stats for video:', videoKey);
              const statsResponse = await fetch(`${SERVER_URL}/api/stats/video/${encodeURIComponent(videoKey)}`);
              
              if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                console.log('Received stats:', statsData);
                setGuessStats(statsData);
              }
            } catch (statsError) {
              console.error('Error fetching stats (server might be down):', statsError);
              // Generate mock stats from local storage as fallback
              const mockStats = generateMockStats(videoKey);
              setGuessStats(mockStats);
            }
          } else {
            console.error('Server response error:', responseData);
            // Generate mock stats from local storage as fallback
            const mockStats = generateMockStats(videoKey);
            setGuessStats(mockStats);
          }
        } catch (serverError) {
          console.error('Server connection error (likely server is down):', serverError);
          // Generate mock stats from local storage as fallback
          const mockStats = generateMockStats(videoKey);
          setGuessStats(mockStats);
        }
        
        setLoadingStats(false);
      } catch (error) {
        console.error('Error in handleGuessSubmit:', error);
        setLoadingStats(false);
      }
    }
  };

  const handlePlayAgain = () => {
    setGuessResult(null);
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
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {!guessResult && (
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
                  {guessStats.source === 'local' && (
                    <p style={{ color: 'orange', fontSize: '0.9em', fontStyle: 'italic' }}>
                      Server unavailable - showing local data only
                    </p>
                  )}
                  <GuessDistribution stats={guessStats} />
                  <p>Total guesses: {guessStats.totalGuesses}</p>
                  <p>Correct percentage: {guessStats.accuracy}%</p>
                </div>
              ) : null}
              
              <button 
                onClick={handlePlayAgain}
                className="play-again-button"
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