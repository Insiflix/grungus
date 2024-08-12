import "./App.css";
import Background from "./components/background";
import Navbar from "./components/Navbar";
import ChatContainer from "./components/ChatContainer";
import Task from "./components/Task";
function App() {
  const pageLayout: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    width: "100vw"
  };

  const middleContent: React.CSSProperties = {
    margin: "0.7rem 0 0 0",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    height: "calc(100vh-2.4rem)",
    width: "100%"
  };

  const taskBar: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    width: "inherit",
  };
  const channelSelector: React.CSSProperties = {
    height: "91.5vh",
    backgroundColor: "rgba(0, 0, 0, 0.60)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    borderRadius: "10px",
    width: "12.5rem",
  };

  return (
    <>
      <Background></Background>
      <div style={pageLayout}>
        <Navbar></Navbar>
        <div style={middleContent}>
          <div style={taskBar}>
            <Task id={"saveisdasneid"}></Task>
            <Task id={"saveisdasneid"}></Task>
            <Task id={"saveisdasneid"}></Task>
            <Task id={"saveisdasneid"}></Task>
            <Task id={"saveisdasneid"}></Task>
            <Task id={"saveisdasneid"}></Task>
            <Task id={"saveisdasneid"}></Task>
          </div>
          <div style={{display: "flex", flexDirection: "row"}}>
          <div style={channelSelector}></div>
          <ChatContainer></ChatContainer>
          <div style={channelSelector}></div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
