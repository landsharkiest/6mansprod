import logo from './logo.svg';
import './App.css';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Upload from './pages/Upload';
import Login from './pages/Login';
import Play from './pages/Play';
import { useDropzone } from 'react-dropzone';
import AWS from 'aws-sdk';
import S3 from 'aws-sdk/clients/s3';

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
  return (
    <div className="Guest-play">
      <button className="play-guest-button">
        Play as Guest
      </button>
    </div>
  )
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
  const s3 = new S3({
    region: "us-east-1",
    accessKeyId: 'AKIA3LUYWHZLKQQ56H5L',
    secretAccessKey: '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',
    params: { Bucket: '6mans-clips-bucket' }
  });

  const uploadToS3 = (file) => {
    const params = {
      Bucket: '6mans-clips-bucket',
      Key: file.name,
      Body: file,
      ContentType: file.type
    };

    s3.upload(params, (err, data) => {
      if (err) {
        console.error("Error uploading file:", err);
      } else {
        console.log("File uploaded successfully:", data);
      }
    });
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
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
