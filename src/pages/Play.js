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
          const randomFile = files[Math.floor(Math.random() * files.length)].Key;
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

  return (
    <div className="Play">
      {loading ? (
        <p>Loading...</p>
      ) : videoUrl ? (
        <>
          <video
            width="480"
            controls
            autoPlay
            onEnded={() => setShowGuessRank(true)}
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          {showGuessRank && <GuessRank />}
        </>
      ) : (
        <p>No verified videos found.</p>
      )}
    </div>
  );
}

function GuessRank() {
  const ranks = ["S", "X", "A", "B+", "B", "C", "D", "E", "H"];
  return (
    <div className="GuessRank" style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
      {ranks.map(rank => (
        <button
          key={rank}
          className="GuessRank-button"
          style={{ margin: '0 8px', padding: '12px 24px', fontSize: '1.2em' }}
        >
          {rank}
        </button>
      ))}
    </div>
  );
}

export default Play;