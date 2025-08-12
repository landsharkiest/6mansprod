import logo from './logo.svg';
import './App.css';
import { BrowserRouter as Router, Route, Routes, Link, useNavigate } from 'react-router-dom';
import Upload from './pages/Upload';
import Play from './pages/Play';
import { useDropzone } from 'react-dropzone';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import React from 'react';

function App() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // Update log data
  const updates = [
    {
      date: "Aug 12, 2025",
      version: "v1.2.0",
      changes: [
        "Added Discord login functionality",
        "User profiles now display in top right",
        "Fixed video encoding issues"
      ]
    },
    {
      date: "Aug 11, 2025", 
      version: "v1.1.0",
      changes: [
        "Added Google Analytics tracking",
        "Improved guess distribution display",
        "Added home button to game page",
        "Added upload file system"
      ]
    },
    {
      date: "Aug 10, 2025",
      version: "v1.0.0", 
      changes: [
        "Initial release of 6mansdle",
      ]
    }
  ];

  // Check if user is logged in when component mounts
  React.useEffect(() => {
    // Check URL for user data from Discord callback
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');
    
    if (userParam) {
      try {
        const userData = JSON.parse(decodeURIComponent(userParam));
        setUser(userData);
        localStorage.setItem('discordUser', JSON.stringify(userData));
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        setLoading(false);
        return;
      } catch (error) {
        console.error('Error parsing user data from URL:', error);
      }
    }
    
    // Check localStorage for existing user
    const savedUser = localStorage.getItem('discordUser');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setLoading(false);
        return;
      } catch (error) {
        console.error('Error parsing saved user data:', error);
        localStorage.removeItem('discordUser');
      }
    }
    
    // If no user data found, try API call (fallback)
    fetch('http://ec2-204-236-200-58.compute-1.amazonaws.com:3001/api/user', {
      credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
      if (data.authenticated) {
        setUser(data.user);
        localStorage.setItem('discordUser', JSON.stringify(data.user));
      }
    })
    .catch(error => console.log('Not logged in'))
    .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    localStorage.removeItem('discordUser');
    setUser(null);
  };
  

  const { getRootProps, getInputProps } = useDropzone();

  return (
    <Router>
    <div className="App">
      <Routes>
        <Route
          path="/play"
          element={
            <div className="App">
              <Play />
            </div>
          }
        />
        <Route
          path="/"
          element={
            <div className="App">
              <header className="App-header">
                {user && (
                  <div style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    padding: '10px 15px',
                    borderRadius: '25px',
                    zIndex: 1000
                  }}>
                    <img 
                      src={user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${user.discriminator % 5}.png`} 
                      alt="Avatar" 
                      style={{
                        width: '40px', 
                        height: '40px', 
                        borderRadius: '50%',
                        border: '2px solid white'
                      }} 
                    />
                    <span style={{
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '16px'
                    }}>
                      {user.username}
                    </span>
                    <button 
                      onClick={logout}
                      style={{
                        marginLeft: '10px',
                        padding: '5px 10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '15px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
                <h1>6mansdle</h1>
                {loading ? (
                  <p>Loading...</p>
                ) : !user ? (
                  <>
                    <input {...getInputProps()} />
                    <UploadClips />
                    <PlayGuest />
                    <DiscordLoginButton />
                    <UpdateLog updates={updates} />
                  </>
                ) : (
                  <>
                    <input {...getInputProps()} />
                    <UploadClips />
                    <PlayGuest />
                    <UpdateLog updates={updates} />
                  </>
                )}
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
        Play
      </button>
    </div>
  );
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

function DiscordLoginButton() {
  return (
    <a href="http://ec2-204-236-200-58.compute-1.amazonaws.com:3001/auth/discord">
      <button style={{
        backgroundColor: '#5865F2',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        padding: '10px 20px',
        marginTop: '50%',
        fontWeight: 'bold',
        cursor: 'pointer'
      }}>
        Login with Discord
      </button>
    </a>
  );
}

// Update Log Component
function UpdateLog({ updates }) {
  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '20px',
      width: '280px',
      maxHeight: '400px',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '10px',
      padding: '15px',
      color: 'white',
      fontSize: '14px',
      overflowY: 'auto',
      zIndex: 1000,
      marginTop: '10%',
      marginLeft: '5%'
    }}>
      <h3 style={{
        margin: '0 0 15px 0',
        fontSize: '18px',
        textAlign: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
        paddingBottom: '10px'
      }}>
        Update Log
      </h3>
      
      {updates.map((update, index) => (
        <div key={index} style={{
          marginBottom: '15px',
          paddingBottom: '15px',
          borderBottom: index < updates.length - 1 ? '1px solid rgba(255, 255, 255, 0.2)' : 'none'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <span style={{
              fontWeight: 'bold',
              color: '#f1f1f1ff'
            }}>
              {update.version}
            </span>
            <span style={{
              fontSize: '12px',
              color: '#ccc'
            }}>
              {update.date}
            </span>
          </div>
          
          <ul style={{
            margin: '0',
            paddingLeft: '20px',
            listStyle: 'none'
          }}>
            {update.changes.map((change, changeIndex) => (
              <li key={changeIndex} style={{
                marginBottom: '4px',
                position: 'relative'
              }}>
                <span style={{
                  position: 'absolute',
                  left: '-15px',
                  color: '#4CAF50'
                }}>
                  •
                </span>
                {change}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}


export default App;
