const ChatContainer = () => {
  const mainContainer: React.CSSProperties = {
    margin: "0 0 10px 0",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    backdropFilter: "blur(3px)",
    border: "solid 2px rgba(255, 255, 255, 0.20)",
    height: "91vh",
    width: "calc(100% - 200px)",
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
    height: "40px",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    backdropFilter: "blur(3px)",
    border: "solid 2px rgba(255, 255, 255, 0.20)",
    borderRadius: "10px",
    padding: "5px"
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
