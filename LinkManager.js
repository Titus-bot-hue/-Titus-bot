import fs from "fs";

const linkFile = "./links.json";

export function saveLink(user, link) {
  let data = fs.existsSync(linkFile) ? JSON.parse(fs.readFileSync(linkFile)) : {};
  if (!data[user]) data[user] = [];
  data[user].push(link);
  fs.writeFileSync(linkFile, JSON.stringify(data, null, 2));
}

export function listLinks(user) {
  let data = fs.existsSync(linkFile) ? JSON.parse(fs.readFileSync(linkFile)) : {};
  return data[user] || [];
}
