import logo from './logo.svg';
import './App.css';
import { BrowserRouter as Router, Route, Routes, Link, useNavigate } from 'react-router-dom';
import Upload from './pages/Upload';
import Login from './pages/Login';
import Play from './pages/Play';
import { useDropzone } from 'react-dropzone';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

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
  // Replace with your actual Cognito Identity Pool ID
  const REGION = "us-east-1";
  const BUCKET = "6mans-clip-bucket";
  const IDENTITY_POOL_ID = "us-east-1:21355927-0f08-488d-9e3c-446b36007857"; // <-- update this

  const s3Client = new S3Client({
    region: REGION,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: REGION },
      identityPoolId: IDENTITY_POOL_ID,
    }),
  });

  const uploadToS3 = async (file) => {
    const params = {
      Bucket: BUCKET,
      Key: file.name,
      Body: await file.arrayBuffer(), // Convert to ArrayBuffer
      ContentType: file.type,
    };
    try {
      const data = await s3Client.send(new PutObjectCommand(params));
      console.log("File uploaded successfully:", data);
    } catch (err) {
      console.error("Error uploading file:", err);
    }
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'video/*': []
    },
    onDrop: (acceptedFiles) => {
      // Handle the uploaded files here
      console.log(acceptedFiles);
      acceptedFiles.forEach(uploadToS3)
      // You can add upload logic here
    }
  });

  return (
    <div className="Upload-clips" {...getRootProps()}>
      <input {...getInputProps()} />
      {
        isDragActive ? (
          <p>Drop the clips here ...</p>
        ) : (
          <button className="Upload-clips-button">
            Upload Clips from 6Mans (Click or Drag files)
          </button>
        )
      }
    </div>
  );
}

export default App;
