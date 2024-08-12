import "./App.css";
import Background from "./components/background";
import Navbar from "./components/Navbar";
import ChatContainer from "./components/ChatContainer";
import Task from "./components/Task";
function App() {
  const pageLayout: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
  };

  const middleContent: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "84.5vw"
  };

  const taskBar: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    width: "100%",
  };
  const channelSelector: React.CSSProperties = {
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.60)",
    backdropFilter: "blur(2px)",
    borderRadius: "10px",
    width: "200px",
  };
  const serverUsers: React.CSSProperties = {
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.60)",
    backdropFilter: "blur(2px)",
    borderRadius: "10px",
    width: "212px",
    minWidth: "212px",
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
          </div>
          <div style={{display: "flex", flexDirection: "row"}}>
          <div style={channelSelector}></div>
          <ChatContainer></ChatContainer>
          </div>
        </div>
        <div style={serverUsers}></div>
      </div>
    </>
  );
}

export default App;
