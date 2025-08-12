import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
  
  // Cache for video files to avoid repeated S3 calls
  const videoCacheRef = React.useRef(null);
  const lastFetchTimeRef = React.useRef(0);
  const fetchVideosRef = React.useRef(null); // Store fetch function for manual calls
  const previousClipRef = React.useRef(null); // Use ref instead of state
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // Create S3Client once and reuse
  const [s3Client] = useState(() => new S3Client({
    region: REGION,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: REGION },
      identityPoolId: IDENTITY_POOL_ID,
    }),
  }));
  
  // Sleep function for retry delays
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
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
    async function fetchVideos(forceNew = false) {
      // Check if we have cached data that's still valid (unless forcing new)
      const now = Date.now();
      if (!forceNew && videoCacheRef.current && (now - lastFetchTimeRef.current) < CACHE_DURATION) {
        // Use cached data
        const files = videoCacheRef.current;
        selectRandomVideo(files);
        setLoading(false);
        return;
      }
      
      // Retry logic with exponential backoff
      const maxRetries = 3;
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        try {
          const command = new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: 'verified/'
          });
          const data = await s3Client.send(command);
          const files = (data.Contents || []).filter(obj => obj.Key.endsWith('.mp4') || obj.Key.endsWith('.webm') || obj.Key.endsWith('.mov'));
          
          // Cache the results
          videoCacheRef.current = files;
          lastFetchTimeRef.current = now;
          
          selectRandomVideo(files);
          break; // Success, exit retry loop
          
        } catch (err) {
          console.error(`Error fetching videos (attempt ${retryCount + 1}):`, err);
          
          if (err.name === 'TooManyRequestsException' || err.name === 'ThrottlingException') {
            retryCount++;
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
              console.log(`Rate limited, retrying in ${delay}ms...`);
              await sleep(delay);
              continue;
            }
          }
          
          // If all retries failed or it's a different error, break out
          console.error('All retry attempts failed or non-retryable error');
          break;
        }
      }
      setLoading(false);
    }
    
    function selectRandomVideo(files) {
      if (files.length > 0) {
        // Filter out the previous clip to avoid back-to-back repeats
        const availableFiles = files.filter(file => file.Key !== previousClipRef.current);
        
        // If only one clip exists or all filtered out, use all files
        const filesToChooseFrom = availableFiles.length > 0 ? availableFiles : files;
        
        const randomIndex = Math.floor(Math.random() * filesToChooseFrom.length);
        const selectedFile = filesToChooseFrom[randomIndex];
        
        // extract rank from filename format like "S_filename.mp4"
        const filenameParts = selectedFile.Key.split('/');
        const filename = filenameParts[filenameParts.length - 1];
        const rank = filename.split('_')[0];
        
        // Debug logging to check rank extraction
        console.log('Selected file:', selectedFile.Key);
        console.log('Extracted filename:', filename);
        console.log('Extracted rank:', rank);
        
        // Validate that the extracted rank is one of the expected ranks
        const validRanks = ["S", "X", "A", "B+", "B", "C", "D", "E", "H"];
        if (!validRanks.includes(rank)) {
          console.warn('Invalid rank extracted:', rank, 'from filename:', filename);
          console.warn('Expected one of:', validRanks);
        }
        
        setActualRank(rank);
        setVideoKey(selectedFile.Key);
        previousClipRef.current = selectedFile.Key; // Use ref instead of state
        const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURIComponent(selectedFile.Key)}`;
        setVideoUrl(url);
      }
    }
    
    // Store the function for manual calls
    fetchVideosRef.current = fetchVideos;
    
    fetchVideos();
  }, []); // Empty dependency array - only run on mount

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
        const SERVER_URL = 'https://backend.6mansdle.com';
        
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
    
    // Call fetchVideos directly with forceNew flag
    if (fetchVideosRef.current) {
      fetchVideosRef.current(true); // Force new video, bypass cache
    }
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
            backgroundColor: 'inherit',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '5px',
            fontSize: '24px',
            fontWeight: 'normal',
            transition: 'background-color 0.3s ease, transform 0.2s ease',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.target.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = 'inherit';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          Home
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
                <div className="stats-container" style={{
                  width: '100%',
                  maxWidth: window.innerWidth <= 600 ? '95vw' : '800px',
                  margin: '0 auto',
                  padding: '20px',
                  boxSizing: 'border-box'
                }}>
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
  
  // Custom colors for each rank
  const rankColors = {
    "S": "#C2185B",    // Dark bright pink
    "X": "#4CAF50",    // Medium green
    "A": "#F44336",    // Bright red
    "B+": "#1916b9ff",   // Darker turquoise
    "B": "#E91E63",    // Light pink
    "C": "#2196F3",    // Average blue
    "D": "#81D4FA",    // Lighter blue
    "E": "#FF5722",    // Orange-red
    "H": "#8D6E63"     // Light brown
  };
  
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
  
  // prepare data for recharts
  const chartData = allRanks.map(rank => {
    const count = distributionMap[rank] || 0;
    const percentage = stats.totalGuesses > 0 
      ? Math.round((count / stats.totalGuesses) * 100) 
      : 0;
    
    return {
      rank: rank,
      count: count,
      percentage: percentage,
      isCorrect: rank === stats.rank,
      color: rankColors[rank]
    };
  });

  // Custom shaped bar component
  const CustomShapeBar = (props) => {
    const { payload, x, y, width, height } = props;
    const barColor = payload.color; // Use custom rank color
    
    // Create a custom hexagonal/diamond shape
    const shapeHeight = height;
    const shapeWidth = width;
    const centerX = x + shapeWidth / 2;
    const topY = y;
    const bottomY = y + shapeHeight;
    
    // Create path for custom shape (hexagon-like)
    const path = `
      M ${centerX} ${topY}
      L ${x + shapeWidth * 0.8} ${topY + shapeHeight * 0.2}
      L ${x + shapeWidth} ${bottomY - shapeHeight * 0.1}
      L ${centerX} ${bottomY}
      L ${x} ${bottomY - shapeHeight * 0.1}
      L ${x + shapeWidth * 0.2} ${topY + shapeHeight * 0.2}
      Z
    `;

    return (
      <g>
        {/* Gradient definition */}
        <defs>
          <linearGradient id={`gradient-${payload.rank}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={barColor} stopOpacity={1} />
            <stop offset="100%" stopColor={barColor} stopOpacity={0.7} />
          </linearGradient>
        </defs>
        
        {/* Custom shaped bar */}
        <path
          d={path}
          fill={`url(#gradient-${payload.rank})`}
          stroke={barColor}
          strokeWidth={2}
          style={{
            filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))',
            transition: 'all 0.3s ease'
          }}
        />
        
        {/* Glow effect for correct rank */}
        {payload.isCorrect && (
          <path
            d={path}
            fill="none"
            stroke={barColor}
            strokeWidth={4}
            opacity={0.8}
            style={{
              filter: 'blur(3px)'
            }}
          />
        )}
      </g>
    );
  };

  // custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          padding: '12px',
          borderRadius: '8px',
          color: 'white',
          border: `2px solid ${data.color}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>
          <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: data.color }}>{`Rank: ${label}`}</p>
          <p style={{ margin: '0 0 4px 0' }}>{`Count: ${data.count}`}</p>
          <p style={{ margin: '0 0 4px 0' }}>{`Percentage: ${data.percentage}%`}</p>
          {data.isCorrect && (
            <p style={{ color: data.color, margin: '4px 0 0 0', fontWeight: 'bold' }}>
              ✓ Correct Rank
            </p>
          )}
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="guess-distribution" style={{ 
      width: '100%', 
      height: window.innerWidth <= 600 ? '280px' : '400px' 
    }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{
            top: 30,
            right: 10,
            left: 10,
            bottom: 10,
          }}
          barCategoryGap={window.innerWidth <= 600 ? "5%" : "10%"}
          maxBarSize={window.innerWidth <= 600 ? 30 : 50}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="rank" 
            tick={{ fontSize: 14, fontWeight: 'bold' }}
            axisLine={{ stroke: '#666' }}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            axisLine={{ stroke: '#666' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar 
            dataKey="count" 
            shape={<CustomShapeBar />}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default Play;