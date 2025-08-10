import logo from './logo.svg';
import './App.css';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Upload from './pages/Upload';
import Login from './pages/Login';
import Play from './pages/Play';
import { useDropzone } from 'react-dropzone';

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
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      // Handle the uploaded files here
      console.log(acceptedFiles);
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
