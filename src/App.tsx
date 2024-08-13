import "./App.css";
import Background from "./components/background";
import Channel from "./components/Channel";
import Navbar from "./components/Navbar";
import ChatContainer from "./components/ChatContainer";
import Friendlist from "./components/Friendlist";
import Task from "./components/Task";
import { useState } from "react";

function App() {
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number | null>(
    null
  );

  const pageLayout: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    width: "100vw",
  };

  const middleContent: React.CSSProperties = {
    margin: "0.7rem 0 0 0",
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh-2.4rem)",
    width: "100%",
  };

  const taskBar: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    width: "inherit",
  };

  const middleContentLower: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
  };

  const taskIds = [
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
  ];

  return (
    <>
      <Background />
      <div style={pageLayout}>
        <Navbar />
        <div style={middleContent}>
          <div style={taskBar}>
            {taskIds.map((id, index) => (
              <Task
                key={index}
                id={id}
                selected={selectedTaskIndex === index}
                onClick={() => setSelectedTaskIndex(index)}
              />
            ))}
          </div>
          <div style={middleContentLower}>
            <Channel />
            <ChatContainer />
            <Friendlist />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
