import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

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
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [customUsername, setCustomUsername] = useState("");

  // --- MOBILE DETECTION ---
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("publicPileUser");
    if (savedUser) { setUsername(savedUser); setIsJoined(true); }
  }, []);

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
      socket.on("receive_message", (data) => setChat((prev) => [...prev, data]));
      socket.on("message_deleted", (deletedId) => setChat((prev) => prev.filter((msg) => String(msg.id) !== String(deletedId))));
      socket.on("active_users", (users) => setActiveUsers([...new Set(users)]));
      return () => {
        socket.off("load_messages"); socket.off("receive_message");
        socket.off("message_deleted"); socket.off("active_users");
      };
    }
  }, [isJoined, username]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.size > 100 * 1024 * 1024) { alert("Max 100MB."); return; }
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleAuth = async () => {
    setError("");
    try {
      if (authMode === "signup") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return setError("Invalid email.");
        const res = await axios.post(`${API_BASE_URL}/register`, { username, email, password });
        alert(res.data.message);
        setAuthMode("login");
      } else {
        const res = await axios.post(`${API_BASE_URL}/login`, { username, password });
        localStorage.setItem("publicPileUser", res.data.username);
        setIsJoined(true);
      }
    } catch (err) { setError(err.response?.data?.error || "Error"); }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/google`, { token: credentialResponse.credential });
      if (res.data.newUser) { setTempToken(credentialResponse.credential); setShowUsernamePrompt(true); }
      else { 
        localStorage.setItem("publicPileUser", res.data.username); 
        setUsername(res.data.username); 
        setIsJoined(true); 
      }
    } catch (err) { setError("Google Login Failed"); }
  };

  const submitCustomUsername = async () => {
    if (!customUsername) return setError("Enter username");
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/google`, { token: tempToken, chosenUsername: customUsername });
      localStorage.setItem("publicPileUser", res.data.username);
      setUsername(res.data.username); setIsJoined(true); setShowUsernamePrompt(false);
    } catch (err) { setError(err.response?.data?.error || "Error"); }
  };

  const sendMessage = () => {
    if (message.trim() !== "" || image !== null) {
      socket.emit("send_message", { user: username, text: message, image: image });
      setMessage(""); setImage(null);
    }
  };

  return (
    <GoogleOAuthProvider clientId="482124776342-8161maq31o64v1tbn7kjem69tpnqdqcj.apps.googleusercontent.com">
      <div style={{...styles.container, flexDirection: isMobile ? 'column' : 'row'}}>
        
        {/* --- DYNAMIC SIDEBAR/HEADER --- */}
        <div style={{
          ...styles.sidebar, 
          width: isMobile ? '100%' : '240px', 
          height: isMobile ? '60px' : '100vh',
          flexDirection: isMobile ? 'row' : 'column',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={styles.logo}>PublicPile</h1>
            {!isMobile && <p style={styles.tagline}>The Digital Bonfire</p>}
          </div>
          {isJoined && <button onClick={() => {localStorage.clear(); window.location.reload();}} style={styles.logoutBtn}>Logout</button>}
        </div>

        <div style={styles.mainArea}>
          {!isJoined ? (
            <div style={styles.authCenter}>
              <div style={{...styles.authCard, width: isMobile ? '90%' : '400px'}}>
                {!showUsernamePrompt ? (
                  <>
                    <div style={styles.tabs}>
                      <button style={authMode === 'login' ? styles.activeTab : styles.tab} onClick={() => setAuthMode("login")}>Login</button>
                      <button style={authMode === 'signup' ? styles.activeTab : styles.tab} onClick={() => setAuthMode("signup")}>Sign Up</button>
                    </div>
                    <input placeholder="Username" style={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} />
                    {authMode === "signup" && <input type="email" placeholder="Email" style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />}
                    <input type="password" placeholder="Password" style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} />
                    {error && <p style={styles.error}>{error}</p>}
                    <button onClick={handleAuth} style={styles.primaryBtn}>Enter</button>
                    <div style={styles.googleWrapper}>
                      <div style={styles.divider}><span>OR</span></div>
                      <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError("Google Login Failed")} theme="filled_blue" width="100%" />
                    </div>
                  </>
                ) : (
                  <>
                    <h3 style={{ color: '#fff' }}>Choose your Pile name</h3>
                    <input placeholder="Handle..." style={styles.input} value={customUsername} onChange={(e) => setCustomUsername(e.target.value)} />
                    <button onClick={submitCustomUsername} style={styles.primaryBtn}>Finish</button>
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
                          <video src={msg.image} controls className="chat-video" style={styles.sharedMedia} />
                        ) : (
                          <img src={msg.image} alt="sent" style={styles.sharedMedia} onClick={() => setEnlargedMedia(msg.image)} />
                        )
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div style={styles.inputArea}>
                  {image && (
                    <div style={styles.previewContainer}>
                      <img src={image} alt="preview" style={styles.previewImage} />
                      <button onClick={() => setImage(null)} style={styles.cancelImg}>✕</button>
                    </div>
                  )}
                  <div style={styles.inputWrapper}>
                    <input type="file" accept="image/*,video/*" id="file-input" style={{ display: 'none' }} onChange={handleFileSelect} />
                    <label htmlFor="file-input" style={styles.fileLabel}>📁</label>
                    <input 
                      value={message} 
                      style={styles.chatInput} 
                      onChange={(e) => setMessage(e.target.value)} 
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()} 
                      placeholder="Message #public-pile" 
                    />
                    {/* --- SEND BUTTON --- */}
                    <button onClick={sendMessage} style={styles.sendBtn}>➤</button>
                  </div>
                </div>
              </div>

              {!isMobile && (
                <div style={styles.userPanel}>
                  <h3 style={styles.panelTitle}>Online — {activeUsers.length}</h3>
                  <div style={styles.userList}>
                    {activeUsers.map((user, idx) => ( 
                      <div key={idx} style={styles.userItem}><span style={styles.statusDot}></span>{user}</div> 
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {enlargedMedia && (
          <div style={styles.modalOverlay} onClick={() => setEnlargedMedia(null)}>
            <button style={styles.closeModal}>✕</button>
            {enlargedMedia.startsWith("data:video") ? (
              <video src={enlargedMedia} controls autoPlay style={styles.modalImage} />
            ) : ( <img src={enlargedMedia} alt="Enlarged" style={styles.modalImage} /> )}
          </div>
        )}
      </div>
    </GoogleOAuthProvider>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#36393f', color: '#dcddde', fontFamily: 'sans-serif', overflow: 'hidden' },
  sidebar: { backgroundColor: '#2f3136', padding: '0 20px', display: 'flex', boxSizing: 'border-box' },
  logo: { fontSize: '1.3rem', color: '#fff', margin: 0 },
  tagline: { fontSize: '0.8rem', color: '#8e9297', marginBottom: '20px' },
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  authCenter: { display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' },
  authCard: { backgroundColor: '#36393f', padding: '32px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' },
  tabs: { display: 'flex', gap: '15px', marginBottom: '20px' },
  tab: { background: 'none', border: 'none', color: '#b9bbbe', cursor: 'pointer', fontSize: '1rem' },
  activeTab: { background: 'none', border: 'none', color: '#fff', borderBottom: '2px solid #5865f2', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' },
  input: { width: '100%', padding: '12px', marginBottom: '15px', backgroundColor: '#202225', border: 'none', color: '#fff', borderRadius: '3px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', padding: '12px', backgroundColor: '#5865f2', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '3px' },
  error: { color: '#f04747', fontSize: '0.8rem', marginBottom: '10px' },
  googleWrapper: { marginTop: '20px', textAlign: 'center' },
  divider: { display: 'flex', alignItems: 'center', color: '#8e9297', fontSize: '0.7rem', margin: '15px 0' },
  chatContainer: { display: 'flex', flexDirection: 'column', flex: 1, height: '100%' },
  chatBox: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' },
  msgLine: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  msgHeader: { display: 'flex', alignItems: 'center', marginBottom: '4px' },
  deleteBtn: { marginLeft: '12px', background: 'none', border: 'none', color: '#f04747', fontSize: '0.7rem', cursor: 'pointer' },
  msgText: { color: '#dcddde', lineHeight: '1.4', wordBreak: 'break-word', textAlign: 'left' },
  sharedMedia: { maxWidth: '100%', width: '400px', borderRadius: '8px', marginTop: '8px', border: '1px solid #202225', cursor: 'pointer' },
  inputArea: { padding: '20px' },
  previewContainer: { position: 'relative', display: 'inline-block', marginBottom: '10px' },
  previewImage: { height: '80px', borderRadius: '4px' },
  cancelImg: { position: 'absolute', top: '-5px', right: '-5px', background: '#f04747', color: 'white', border: 'none', borderRadius: '50%', cursor: 'pointer', width: '20px', height: '20px' },
  inputWrapper: { backgroundColor: '#40444b', borderRadius: '8px', padding: '10px 15px', display: 'flex', alignItems: 'center' },
  fileLabel: { cursor: 'pointer', marginRight: '15px', fontSize: '1.3rem' },
  chatInput: { flex: 1, border: 'none', background: 'none', color: '#fff', outline: 'none', fontSize: '1rem' },
  sendBtn: { background: 'none', border: 'none', color: '#5865f2', fontSize: '1.4rem', cursor: 'pointer', paddingLeft: '10px' },
  logoutBtn: { padding: '8px 15px', backgroundColor: '#f04747', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '3px', fontSize: '0.8rem' },
  userPanel: { width: '240px', backgroundColor: '#2f3136', padding: '20px', borderLeft: '1px solid #202225' },
  panelTitle: { fontSize: '0.75rem', color: '#8e9297', marginBottom: '20px', fontWeight: 'bold' },
  userList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  userItem: { display: 'flex', alignItems: 'center', color: '#b9bbbe', fontSize: '0.95rem' },
  statusDot: { width: '8px', height: '8px', backgroundColor: '#3ba55e', borderRadius: '50%', marginRight: '12px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalImage: { maxWidth: '90%', maxHeight: '90%' },
  closeModal: { position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#fff', fontSize: '2rem' }
};

export default App;