import logo from './logo.svg';
import './App.css';
import { BrowserRouter as Router, Route, Routes, Link, useNavigate } from 'react-router-dom';
import Upload from './pages/Upload';
import Login from './pages/Login';
import Play from './pages/Play';
import { useDropzone } from 'react-dropzone';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import React from 'react';

function App() {
  

  const { getRootProps, getInputProps } = useDropzone();

  return (
    <Router>
    <div className="App">
      <Routes>
        <Route
          path="/login"
          element={
            <div className="App">
              <Login />
            </div>
          }
        />
        <Route
          path="/play"
          element={
            <div className="App">
              <Play />
            </div>
          }
        />
        <Route
          path="/*"
          element={
            <div className="App">
              <header className="App-header">
                <h1>6mansdle</h1>
                  <input {...getInputProps()} />
                <UploadClips />
                <PlayGuest />
                <Link to="/login"><LogIn /></Link>
              </header>
            </div>
          }
        />
      </Routes>
    </div>
    </Router>
  );
}


// Components for the guest play stuff
function PlayGuest() {
  const navigate = useNavigate();
  return (
    <div className="Guest-play">
      <button className="play-guest-button" onClick={() => navigate('/play')}>
        Play as Guest
      </button>
    </div>
  );
}


// Components for the login stuff
function LogIn() {
  return (
    <div className="Log-in">
      <button className="Log-in-button">
        Log In
      </button>
    </div>
  )
}

// Components for the uploading clips stuff
function UploadClips() {
  const REGION = "us-east-1";
  const BUCKET = "6mans-clip-bucket";
  const IDENTITY_POOL_ID = "us-east-1:21355927-0f08-488d-9e3c-446b36007857";

  const ranks = ["S", "X", "A", "B+", "B", "C", "D", "E", "H"];
  const [selectedRank, setSelectedRank] = React.useState(ranks[0]);
  const [pendingFiles, setPendingFiles] = React.useState([]);

  const s3Client = new S3Client({
    region: REGION,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: REGION },
      identityPoolId: IDENTITY_POOL_ID,
    }),
  });

  const uploadToS3 = async (file, rank) => {
    const params = {
      Bucket: BUCKET,
      Key: `${rank}_${file.name}`,
      Body: await file.arrayBuffer(),
      ContentType: file.type,
    };
    try {
      const data = await s3Client.send(new PutObjectCommand(params));
      console.log("File uploaded successfully:", data);
    } catch (err) {
      console.error("Error uploading file:", err);
    }
  };

  const [uploadError, setUploadError] = React.useState("");
  const MAX_SIZE_MB = 50;
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'video/*': []
    },
    onDrop: (acceptedFiles) => {
      const tooLarge = acceptedFiles.filter(file => file.size > MAX_SIZE_MB * 1024 * 1024);
      if (tooLarge.length > 0) {
        setUploadError(`Some files are too large (max ${MAX_SIZE_MB}MB): ${tooLarge.map(f => f.name).join(", ")}`);
        setPendingFiles([]);
      } else {
        setUploadError("");
        setPendingFiles(acceptedFiles);
      }
    }
  });

  const handleUpload = () => {
    pendingFiles.forEach(file => uploadToS3(file, selectedRank));
    setPendingFiles([]);
  };

  return (
    <div className="Upload-clips" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div {...getRootProps()} style={{ marginBottom: '8px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the clips here ...</p>
        ) : (
          <button className="Upload-clips-button">
            Upload Clips from 6Mans (Click or Drag files)
          </button>
        )}
      </div>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <label htmlFor="rank-select">Select Rank:</label>
        <select
          id="rank-select"
          value={selectedRank}
          onChange={e => setSelectedRank(e.target.value)}
        >
          {ranks.map(rank => (
            <option key={rank} value={rank}>{rank}</option>
          ))}
        </select>
      </div>
      {uploadError && (
        <div style={{ color: 'red', marginBottom: '16px' }}>{uploadError}</div>
      )}
      {pendingFiles.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <p>Ready to upload {pendingFiles.length} file(s) as rank <b>{selectedRank}</b>:</p>
          <ul>
            {pendingFiles.map(file => (
              <li key={file.name}>{file.name}</li>
            ))}
          </ul>
          <button onClick={handleUpload} className="Upload-clips-button">Confirm Upload</button>
        </div>
      )}
    </div>
  );
}

export default App;
