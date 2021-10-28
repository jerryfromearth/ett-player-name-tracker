"use strict";

const fetch = require("node-fetch");
const fs = require("fs").promises;

let dbFile = "db.json";
const INTERVAL_MINUTES = 10;
let mapUsers = new Map();

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

async function track() {
  console.log(new Date().toISOString());

  console.log("Poll start - currently tracked users:", mapUsers.size);

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
    let existingUser = mapUsers.get(newUser.Id);
    if (existingUser === undefined) {
      mapUsers.set(newUser.Id, newUser);
      console.log(`Adding new user: ${newUser.UserName}`);
    } else {
      if (newUser.UserName !== existingUser.UserName) {
        existingUser.UserName = newUser.UserName;
        existingUser.History.push(newUser.History[0]);
        mapUsers.set(existingUser.Id, existingUser);
        console.log(
          `Found new username!\n${JSON.stringify(existingUser, null, 2)}`
        );
      }
    }
  });

  console.log("Poll end - Currently tracked users:", mapUsers.size);

  let users = [];
  for (const [Id, user] of mapUsers) {
    users.push(mapUsers.get(Id));
  }

  users = users.sort((user1, user2) => {
    return user2.History.length - user1.History.length;
  });
  console.log(
    `Current champion:\n${
      users.length == 0 ? "" : JSON.stringify(users[0], null, 2)
    }`
  );

  await fs.writeFile(dbFile, JSON.stringify(users, null, 2), "utf8");
  console.log("");
}

async function main() {
  // Parse users from json
  try {
    let fileContent = await fs.readFile(dbFile, "utf8");
    let users = JSON.parse(fileContent);
    for (const user of users) {
      mapUsers.set(user.Id, user);
    }
  } catch (error) {
    console.log(error);
  }

  track();
  setInterval(track, 1000 * 60 * INTERVAL_MINUTES);
}

main();
