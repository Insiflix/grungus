const ChatContainer = () => {
  const mainContainer: React.CSSProperties = {
    margin: "0 0 1rem 0",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)",
    border: "solid 2px rgba(255, 255, 255, 0.20)",
    height: "90.5vh",
    width: "100%",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column"
  };

  const chatStyle: React.CSSProperties = {
    height: "90%"
  }

  const inputBarStyle: React.CSSProperties = {
    height: "10%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  }

  const inputStyle: React.CSSProperties = {
    width: "95%",
    height: "2.5rem",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)",
    border: "solid 2px rgba(255, 255, 255, 0.20)",
    borderRadius: "10px",
    padding: "0.3rem"
  }

  return (
    <>
      <div style={mainContainer}>
        <div style={chatStyle}></div>
        <div style={inputBarStyle}>
          <input type="text" style={inputStyle} />
        </div>
      </div>
    </>
  );
};

export default ChatContainer;
