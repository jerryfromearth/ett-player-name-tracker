"use strict";

const fetch = require("node-fetch");
const fs = require("fs").promises;

let dbFile = "db.json";
const INTERVAL_MINUTES = 1;

function parseSnapshot(json) {
  let users = json.OnlineUses.map((user) => {
    user.ELO = Number(user.ELO);
    user.Id = Number(user.Id);
    user.History = [
      { UserName: user.UserName, Time: new Date().toISOString() },
    ];
    return user;
  });
  return users;
}

async function loadAndParse() {
  console.log(new Date().toISOString());

  // Parse users from json
  let users = [];
  try {
    let fileContent = await fs.readFile(dbFile, "utf8");
    users = JSON.parse(fileContent);
  } catch (error) {
    console.log(error);
  }

  console.log("Users in file:", users.length);

  // Fetch new_users
  let onlineUsers = [];
  try {
    let url =
      "http://elevenlogcollector-env.js6z6tixhb.us-west-2.elasticbeanstalk.com/ElevenServerLiteSnapshot";
    let settings = { method: "Get" };
    let res = await fetch(url, settings);
    let json = await res.json();
    onlineUsers = parseSnapshot(json);
  } catch (error) {
    console.error(error);
    return;
  }

  console.log("Online users:", onlineUsers.length);

  // Merge new_users into users
  onlineUsers.forEach((newUser) => {
    let existingUsers = users.filter((user) => user.Id === newUser.Id);
    if (existingUsers.length === 0) {
      users.push(newUser);
      console.log(`Adding new user: ${newUser.UserName}`);
    } else {
      let existingUser = existingUsers[0];
      if (newUser.UserName !== existingUser.UserName) {
        existingUser.UserName = newUser.UserName;
        existingUser.History.push(newUser.History[0]);
        console.log(
          `Found new username!\n${JSON.stringify(existingUser, null, 2)}`
        );
      }
    }
  });

  console.log("Tracked users:", users.length);

  await fs.writeFile(dbFile, JSON.stringify(users, null, 2));
}

loadAndParse();
setInterval(loadAndParse, 1000 * 60 * INTERVAL_MINUTES);
