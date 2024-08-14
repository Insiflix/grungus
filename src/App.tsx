import "./App.css";
import React, { useState } from "react";
import Background from "./components/background";
import Channel from "./components/Channel";
import Navbar from "./components/Navbar";
import ChatContainer from "./components/ChatContainer";
import Friendlist from "./components/Friendlist";
import Taskbar from "./components/Taskbar";

function App() {
  const [selectedIndex, setSelectedIndex] = useState<{
    type: "task" | "server";
    index: number | null;
  }>({ type: "task", index: null });

  const handleSelection = (type: "task" | "server", index: number) => {
    setSelectedIndex({ type, index });
  };

  const pageLayout: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    width: "100vw",
  };

  const middleContent: React.CSSProperties = {
    margin: "0.7rem 0 0 0",
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 2.4rem)",
    width: "100%",
  };

  const middleContentLower: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
  };

  const taskIds = [
    // recent userIDs stored locally
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
    "saveisdasneid",
  ];

  const ChannelSelectorStyle: React.CSSProperties = {};
  const FriendListStyle: React.CSSProperties = {};

  return (
    <>
      <Background />
      <div style={pageLayout}>
        <Navbar
          selectedServerIndex={
            selectedIndex.type === "server" ? selectedIndex.index : null
          }
          onSelectServer={(index) => handleSelection("server", index)}
        />
        <div style={middleContent}>
          <Taskbar
            taskIds={taskIds}
            selectedTaskIndex={
              selectedIndex.type === "task" ? selectedIndex.index : null
            }
            onSelectTask={(index) => handleSelection("task", index)}
          />
          <div style={middleContentLower}>
            <Channel style={ChannelSelectorStyle} />
            <ChatContainer />
            <Friendlist style={FriendListStyle} />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
