import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
// 1. IMPORT GOOGLE OAUTH COMPONENTS
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

// --- CLOUD CONFIGURATION ---
// This variable automatically switches between your live Render server and localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const socket = io.connect(API_BASE_URL);

function App() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [image, setImage] = useState(null); 
  const [chat, setChat] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [enlargedMedia, setEnlargedMedia] = useState(null);

  // --- STATES FOR CUSTOM USERNAME PROMPT ---
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [customUsername, setCustomUsername] = useState("");

  const messagesEndRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("publicPileUser");
    if (savedUser) { setUsername(savedUser); setIsJoined(true); }
  }, []);

  // --- AUDIO FIX: Mute background videos when modal opens ---
  useEffect(() => {
    const chatVideos = document.querySelectorAll(".chat-video");
    if (enlargedMedia) {
      chatVideos.forEach((v) => { v.pause(); v.muted = true; });
    } else {
      chatVideos.forEach((v) => { v.muted = false; });
    }
  }, [enlargedMedia]);

  useEffect(() => {
    if (isJoined) {
      socket.emit("join_pile", username);
      socket.emit("request_history");
      socket.on("load_messages", (history) => setChat(history));
      const handleNewMessage = (data) => setChat((prev) => [...prev, data]);
      socket.on("receive_message", handleNewMessage);
      const handleDeleteMessage = (deletedId) => setChat((prev) => prev.filter((msg) => String(msg.id) !== String(deletedId)));
      socket.on("message_deleted", handleDeleteMessage);
      const handleUserList = (users) => setActiveUsers([...new Set(users)]);
      socket.on("active_users", handleUserList);
      return () => {
        socket.off("load_messages"); socket.off("receive_message");
        socket.off("message_deleted"); socket.off("active_users");
      };
    }
  }, [isJoined, username]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    const limit = 100 * 1024 * 1024;
    if (file && file.size > limit) { alert("File too heavy! Max 100MB."); return; }
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // --- STANDARD AUTH HANDLER ---
  const handleAuth = async () => {
    setError("");
    try {
      if (authMode === "signup") {
        // --- EMAIL VALIDATION FIX ---
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return setError("Please enter a valid email address (e.g., name@gmail.com)");
        }
        // ---------------------------
        const res = await axios.post(`${API_BASE_URL}/register`, { username, email, password });
        alert(res.data.message);
        setAuthMode("login");
      } else if (authMode === "login") {
        const res = await axios.post(`${API_BASE_URL}/login`, { username, password });
        localStorage.setItem("publicPileUser", res.data.username);
        setIsJoined(true);
      }
    } catch (err) { 
        setError(err.response?.data?.error || "Connection Error"); 
    }
  };

  // --- GOOGLE LOGIN SUCCESS HANDLER ---
  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/google`, {
        token: credentialResponse.credential,
      });

      if (res.data.newUser) {
        setTempToken(credentialResponse.credential);
        setShowUsernamePrompt(true);
      } else {
        localStorage.setItem("publicPileUser", res.data.username);
        setUsername(res.data.username);
        setIsJoined(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Google Login Failed");
    }
  };

  // --- SUBMIT CUSTOM USERNAME HANDLER ---
  const submitCustomUsername = async () => {
    if (!customUsername) return setError("Please enter a username");
    setError("");
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/google`, {
        token: tempToken,
        chosenUsername: customUsername
      });
      localStorage.setItem("publicPileUser", res.data.username);
      setUsername(res.data.username);
      setIsJoined(true);
      setShowUsernamePrompt(false);
    } catch (err) {
      setError(err.response?.data?.error || "Error saving username");
    }
  };

  const sendMessage = () => {
    if (message !== "" || image !== null) {
      socket.emit("send_message", { user: username, text: message, image: image });
      setMessage(""); setImage(null);
    }
  };

  return (
    <GoogleOAuthProvider clientId="482124776342-8161maq31o64v1tbn7kjem69tpnqdqcj.apps.googleusercontent.com">
      <div style={styles.container}>
        <div style={styles.sidebar}>
          <h1 style={styles.logo}>PublicPile</h1>
          <p style={styles.tagline}>The Digital Bonfire</p>
          {isJoined && <button onClick={() => {localStorage.clear(); window.location.reload();}} style={styles.logoutBtn}>Logout</button>}
        </div>

        <div style={styles.mainArea}>
          {!isJoined ? (
            <div style={styles.authCenter}>
              <div style={styles.authCard}>
                {!showUsernamePrompt ? (
                  <>
                    <div style={styles.tabs}>
                      <button style={authMode === 'login' ? styles.activeTab : styles.tab} onClick={() => setAuthMode("login")}>Login</button>
                      <button style={authMode === 'signup' ? styles.activeTab : styles.tab} onClick={() => setAuthMode("signup")}>Sign Up</button>
                    </div>
                    
                    <input placeholder="Username" style={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} />
                    
                    {authMode === "signup" && (
                      <input type="email" placeholder="Email Address" style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
                    )}
                    
                    <input type="password" placeholder="Password" style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} />
                    
                    {error && <p style={styles.error}>{error}</p>}
                    
                    <button onClick={handleAuth} style={styles.primaryBtn}>Enter</button>

                    <div style={styles.googleWrapper}>
                      <div style={styles.divider}><span>OR</span></div>
                      <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setError("Google Login Failed")}
                        theme="filled_blue"
                        width="100%"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <h3 style={{ color: '#fff', marginBottom: '15px' }}>Choose your Pile name</h3>
                    <p style={{ fontSize: '0.8rem', color: '#b9bbbe', marginBottom: '20px' }}>
                      Welcome! Tell everyone what to call you.
                    </p>
                    <input 
                      placeholder="Enter a handle..." 
                      style={styles.input} 
                      value={customUsername} 
                      onChange={(e) => setCustomUsername(e.target.value)} 
                    />
                    {error && <p style={styles.error}>{error}</p>}
                    <button onClick={submitCustomUsername} style={styles.primaryBtn}>Finish Signing Up</button>
                    <button 
                      onClick={() => setShowUsernamePrompt(false)} 
                      style={{ ...styles.tab, marginTop: '10px', fontSize: '0.8rem', width: '100%' }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
              <div style={styles.chatContainer}>
                  <div style={styles.chatBox}>
                  {chat.map((msg) => (
                      <div key={msg.id} style={styles.msgLine}>
                          <div style={styles.msgHeader}>
                              <strong style={{ color: msg.user === username ? '#7289da' : '#43b581' }}>{msg.user}</strong>
                              {msg.user === username && <button onClick={() => socket.emit("delete_message", { messageId: msg.id, user: username })} style={styles.deleteBtn}>Delete</button>}
                          </div>
                          {msg.text && <div style={styles.msgText}>{msg.text}</div>}
                          {msg.image && (
                            msg.image.startsWith("data:video") ? (
                              <video src={msg.image} controls className="chat-video" muted={!!enlargedMedia} style={styles.sharedVideo} onClick={(e) => { e.target.pause(); setEnlargedMedia(msg.image); }} />
                            ) : (
                              <img src={msg.image} alt="sent" style={styles.sharedImage} onClick={() => setEnlargedMedia(msg.image)} />
                            )
                          )}
                      </div>
                  ))}
                  <div ref={messagesEndRef} />
                  </div>
                  <div style={styles.inputArea}>
                  {image && (
                      <div style={styles.previewContainer}>
                          {image.startsWith("data:video") ? ( <video src={image} style={styles.previewImage} muted /> ) : ( <img src={image} alt="preview" style={styles.previewImage} /> )}
                          <button onClick={() => setImage(null)} style={styles.cancelImg}>✕</button>
                      </div>
                  )}
                  <div style={styles.inputWrapper}>
                      <input type="file" accept="image/*,video/*" id="file-input" style={{ display: 'none' }} onChange={handleFileSelect} />
                      <label htmlFor="file-input" style={styles.fileLabel}>📁</label>
                      <input value={message} style={styles.chatInput} onChange={(e) => setMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} placeholder="Message #public-pile" />
                  </div>
                  </div>
              </div>
              <div style={styles.userPanel}>
                  <h3 style={styles.panelTitle}>Online — {activeUsers.length}</h3>
                  <div style={styles.userList}>
                      {activeUsers.map((user, idx) => ( <div key={idx} style={styles.userItem}><span style={styles.statusDot}></span>{user}</div> ))}
                  </div>
              </div>
            </div>
          )}
        </div>

        {enlargedMedia && (
          <div style={styles.modalOverlay} onClick={() => setEnlargedMedia(null)}>
            <button style={styles.closeModal} onClick={() => setEnlargedMedia(null)}>✕</button>
            {enlargedMedia.startsWith("data:video") ? (
              <video src={enlargedMedia} controls autoPlay style={styles.modalImage} onClick={(e) => e.stopPropagation()} />
            ) : ( <img src={enlargedMedia} alt="Enlarged" style={styles.modalImage} onClick={(e) => e.stopPropagation()} /> )}
          </div>
        )}
      </div>
    </GoogleOAuthProvider>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#36393f', color: '#dcddde', fontFamily: 'sans-serif' },
  sidebar: { width: '240px', backgroundColor: '#2f3136', padding: '20px', display: 'flex', flexDirection: 'column' },
  logo: { fontSize: '1.5rem', color: '#fff', margin: 0 },
  tagline: { fontSize: '0.8rem', color: '#8e9297', marginBottom: '20px' },
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' },
  authCenter: { display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' },
  authCard: { backgroundColor: '#36393f', padding: '32px', borderRadius: '8px', width: '400px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' },
  tabs: { display: 'flex', gap: '15px', marginBottom: '20px' },
  tab: { background: 'none', border: 'none', color: '#b9bbbe', cursor: 'pointer', fontSize: '1rem' },
  activeTab: { background: 'none', border: 'none', color: '#fff', borderBottom: '2px solid #5865f2', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' },
  input: { width: '100%', padding: '12px', marginBottom: '15px', backgroundColor: '#202225', border: 'none', color: '#fff', borderRadius: '3px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', padding: '12px', backgroundColor: '#5865f2', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '3px', boxSizing: 'border-box' },
  error: { color: '#f04747', fontSize: '0.8rem', marginBottom: '10px' },
  googleWrapper: { marginTop: '20px', textAlign: 'center' },
  divider: { display: 'flex', alignItems: 'center', color: '#8e9297', fontSize: '0.7rem', margin: '15px 0' },
  chatContainer: { display: 'flex', flexDirection: 'column', flex: 1, height: '100%' },
  chatBox: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'flex-start' },
  msgLine: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' },
  msgHeader: { display: 'flex', alignItems: 'center', marginBottom: '4px' },
  deleteBtn: { marginLeft: '12px', background: 'none', border: 'none', color: '#f04747', fontSize: '0.7rem', cursor: 'pointer', opacity: 0.6 },
  msgText: { color: '#dcddde', lineHeight: '1.4' },
  sharedImage: { maxWidth: '400px', maxHeight: '400px', borderRadius: '8px', marginTop: '8px', border: '1px solid #202225', cursor: 'zoom-in' },
  sharedVideo: { maxWidth: '400px', borderRadius: '8px', marginTop: '8px', border: '1px solid #202225', cursor: 'pointer' },
  inputArea: { padding: '20px' },
  previewContainer: { position: 'relative', display: 'inline-block', marginBottom: '10px', backgroundColor: '#2f3136', padding: '10px', borderRadius: '8px' },
  previewImage: { height: '80px', borderRadius: '4px' },
  cancelImg: { position: 'absolute', top: '0', right: '0', background: '#f04747', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', width: '20px', height: '20px' },
  inputWrapper: { backgroundColor: '#40444b', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center' },
  fileLabel: { cursor: 'pointer', marginRight: '12px', fontSize: '1.2rem' },
  chatInput: { flex: 1, border: 'none', background: 'none', color: '#fff', outline: 'none', fontSize: '1rem' },
  logoutBtn: { marginTop: 'auto', padding: '10px', backgroundColor: '#f04747', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '3px' },
  userPanel: { width: '240px', backgroundColor: '#2f3136', padding: '20px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #202225' },
  panelTitle: { fontSize: '0.75rem', textTransform: 'uppercase', color: '#8e9297', marginBottom: '20px', letterSpacing: '0.5px', fontWeight: 'bold' },
  userList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  userItem: { display: 'flex', alignItems: 'center', color: '#b9bbbe', fontSize: '0.95rem', cursor: 'default' },
  statusDot: { width: '8px', height: '8px', backgroundColor: '#3ba55e', borderRadius: '50%', marginRight: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, cursor: 'zoom-out' },
  modalImage: { maxWidth: '90%', maxHeight: '90%', borderRadius: '4px', boxShadow: '0 5px 30px rgba(0,0,0,0.5)', cursor: 'default' },
  closeModal: { position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer', zIndex: 1001 }
};

export default App;