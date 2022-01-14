"use strict";

const fetch = require("node-fetch");
const fs = require("fs").promises;
const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");

let dbFile = "users.db";
const INTERVAL_MINUTES = 10;

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

async function loadDB() {
  let users = [];
  // Parse users from json
  let db = await open({ filename: dbFile, driver: sqlite3.Database });

  console.log("Connected to the database.");

  try {
    await db.exec(
      "CREATE TABLE users(Id, UserName, Device, Platform, ELO, History)"
    );
  } catch (error) {}
  return db;
}

async function exportDB(db) {
  let data = await db.all("SELECT * FROM users");
  data = data.map((row) => {
    row.History = JSON.parse(row.History);
    return row;
  });
  await fs.writeFile("users.json", JSON.stringify(data, null, 2), "utf-8");
}

async function track() {
  let db = await loadDB();

  console.log(new Date().toISOString());
  let count = await db.all("SELECT COUNT(*) as count FROM users");
  console.log("Poll start - Currently tracked users:", count[0]);

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
  for (let onlineUser of onlineUsers) {
    let user = await db.get(`SELECT * FROM users WHERE Id=?`, onlineUser.Id);

    if (user == null) {
      // User doesn't exist in DB. Insert.
      const result = await db.run(
        "INSERT INTO users (Id,UserName,Device,Platform,ELO,History) VALUES (?,?,?,?,?,?)",
        onlineUser.Id,
        onlineUser.UserName,
        onlineUser.Device,
        onlineUser.Platform,
        onlineUser.ELO,
        JSON.stringify(onlineUser.History, null, 2)
      );
      continue;
    }

    // user already exist in db
    let historyBak = user.History;
    user.History = JSON.parse(user.History);
    if (
      user.History.filter((entry) => entry.UserName === onlineUser.UserName)
        .length === 0
    ) {
      console.log(
        `Found new username! old: ${JSON.stringify(
          user,
          null,
          2
        )}, new: ${JSON.stringify(onlineUser, null, 2)}`
      );
      user.History = user.History.concat(onlineUser.History);
      console.log(`Merged: user: ${JSON.stringify(user, null, 2)}`);
    }

    const result = await db.run(
      "UPDATE users SET UserName=(?),Device=(?),Platform=(?),ELO=(?),History=(?) WHERE ID=(?)",
      onlineUser.UserName,
      onlineUser.Device,
      onlineUser.Platform,
      onlineUser.ELO,
      JSON.stringify(user.History, null, 2),
      onlineUser.Id
    );
  }

  count = await db.all("SELECT COUNT(*) as count FROM users");
  console.log("Poll end - Currently tracked users:", count[0]);

  await exportDB(db);

  await db.close();

  //await fs.writeFile(dbFile, JSON.stringify(users, null, 2), "utf8");
  console.log("");
}

async function main() {
  track();
  setInterval(await track, 1000 * 60 * INTERVAL_MINUTES);
}

main();
