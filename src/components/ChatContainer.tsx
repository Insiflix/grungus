const ChatContainer = () => {
  const mainContainer: React.CSSProperties = {
    margin: "8vh 0 0 0",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    backdropFilter: "blur(2px)",
    border: "solid 2px rgba(255, 255, 255, 0.20)",
    height: "92vh",
    width: "70vw",
    borderRadius: "10px",
    display: "flex",
    justifyContent: "center",
  };

  return (
    <>
      <div style={mainContainer}></div>
    </>
  );
};

export default ChatContainer;
