SDSOL Jira Task Manager
=============

A custom project management solution by Esteban <esteban@sdsol.com>.

## Requirements

> NodeJS >= v20

## Install

```
npm install
```

## Config


```
cp config.example.json config.json
```

Get Jira API Key: https://id.atlassian.com/manage-profile/security/api-tokens


## Run

```
node index [port]
```

## Run in the Background

```
npm install -g pm2
```

```
pm2 start index.js --name jira-tasks
```

```
pm2 startup
```

```
pm2 save
```