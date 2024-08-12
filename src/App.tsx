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
  const taskBar: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    width: "70vw",
  };

  return (
    <>
      <Background></Background>
      <div style={pageLayout}>
        <Navbar></Navbar>
        <ChatContainer></ChatContainer>
        <div style={taskBar}>
          <Task id={"saveisdasneid"}></Task>
        </div>
      </div>
    </>
  );
}

export default App;
