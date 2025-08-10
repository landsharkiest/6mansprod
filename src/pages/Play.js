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
        const response = await fetch('http://localhost:3001/api/guesses', {
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
        
        console.log('Guess saved successfully');
      } catch (error) {
        console.error('Error saving guess:', error);
      }
    }
  };

  const handlePlayAgain = () => {
    setGuessResult(null);
    setShowGuessRank(false);
    setLoading(true);
    setVideoUrl(null);
    
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

export default Play;