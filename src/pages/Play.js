import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import './Play.css';

function Play() {
  const REGION = "us-east-1";
  const BUCKET = "6mans-clip-bucket";
  const IDENTITY_POOL_ID = "us-east-1:21355927-0f08-488d-9e3c-446b36007857";

  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [videoKey, setVideoKey] = useState(null);
  const [actualRank, setActualRank] = useState(null);
  const [guessResult, setGuessResult] = useState(null);
  const [guessStats, setGuessStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [isDatabaseConnected, setIsDatabaseConnected] = useState(true);
  
  // store guess locally and delete after successful server save
  const storeGuessLocally = (videoKey, guessedRank, actualRank, isCorrect) => {
    try {
      const localGuess = {
        videoKey,
        guessedRank,
        actualRank,
        isCorrect,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('pendingGuess', JSON.stringify(localGuess));
    } catch (error) {
      console.error('Failed to save guess locally:', error);
    }
  };

  // delete local guess after successful server save
  const deleteLocalGuess = () => {
    try {
      localStorage.removeItem('pendingGuess');
    } catch (error) {
      console.error('Failed to delete local guess:', error);
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
          
          // extract rank from filename format like "S_filename.mp4"
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
    // compare guessed rank with actual rank
    const isCorrect = guessedRank === actualRank;
    setGuessResult({
      correct: isCorrect,
      guessedRank,
      actualRank
    });

    // save guess locally first
    if (videoKey) {
      storeGuessLocally(videoKey, guessedRank, actualRank, isCorrect);
      
      try {
        setLoadingStats(true);
        const SERVER_URL = 'https://api.6mansdle.com';
        
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

        const responseData = await response.json();
        
        if (response.ok) {
          // delete local guess after successful server save
          deleteLocalGuess();
          setIsDatabaseConnected(true);
          
          // fetch statistics for this video
          try {
            const statsResponse = await fetch(`${SERVER_URL}/api/stats/video/${encodeURIComponent(videoKey)}`);
            
            if (statsResponse.ok) {
              const statsData = await statsResponse.json();
              setGuessStats(statsData);
            }
          } catch (statsError) {
            console.error('Error fetching stats:', statsError);
          }
        } else {
          console.error('Server response error:', responseData);
          setIsDatabaseConnected(false);
        }
      } catch (serverError) {
        console.error('Server connection error:', serverError);
        setIsDatabaseConnected(false);
      }
      
      setLoadingStats(false);
    }
  };

  const handlePlayAgain = () => {
    setGuessResult(null);
    setLoading(true);
    setVideoUrl(null);
    setGuessStats(null);
    setIsDatabaseConnected(true);
    
    // fetch new random video
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
          
          // extract rank from filename
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
      <div className="home-button-container" style={{ 
        position: 'absolute', 
        top: '20px', 
        left: '20px', 
        zIndex: 1000 
      }}>
        <Link 
          to="/" 
          style={{ 
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#2196F3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            transition: 'background-color 0.3s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#0b7dda'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#2196F3'}
        >
          🏠 Home
        </Link>
      </div>
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
              
              {isDatabaseConnected && loadingStats && (
                <p>Loading statistics...</p>
              )}
              
              {isDatabaseConnected && guessStats && (
                <div className="stats-container">
                  <h3>Guess Distribution</h3>
                  <GuessDistribution stats={guessStats} />
                  <p>Total guesses: {guessStats.totalGuesses}</p>
                  <p>Correct percentage: {guessStats.accuracy}%</p>
                </div>
              )}
              
              {!isDatabaseConnected && (
                <p style={{ color: 'orange', fontSize: '0.9em', fontStyle: 'italic' }}>
                  Database unavailable - guess saved locally
                </p>
              )}
              
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
  // get all possible ranks
  const allRanks = ["S", "X", "A", "B+", "B", "C", "D", "E", "H"];
  
  // create map of all ranks with counts
  const distributionMap = {};
  allRanks.forEach(rank => {
    distributionMap[rank] = 0;
  });
  
  // fill in actual counts
  if (stats.distribution) {
    stats.distribution.forEach(item => {
      distributionMap[item.guessed_rank] = parseInt(item.count);
    });
  }
  
  // calculate highest count for scaling
  const maxCount = Math.max(...Object.values(distributionMap), 1);
  
  // generate bar colors based on actual rank
  const getBarColor = (rank) => {
    if (rank === stats.rank) {
      return '#4CAF50'; // green for correct rank
    }
    return '#2196F3'; // blue for other ranks
  };
  
  return (
    <div className="guess-distribution">
      {allRanks.map(rank => {
        const count = distributionMap[rank] || 0;
        const percentage = stats.totalGuesses > 0 
          ? Math.round((count / stats.totalGuesses) * 100) 
          : 0;
        const barWidth = Math.max((percentage / 100) * 100, percentage > 0 ? 5 : 0); // minimum 5% width if there are guesses
        
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