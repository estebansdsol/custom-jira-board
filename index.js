#!/usr/bin/env node

import config from "./config.json" with { type: "json" };

import axios from 'axios';
import moment from 'moment';
import express from 'express';

import * as fs from 'fs'
import * as child from 'child_process';

const app = express()

app.use(express.json())

moment.suppressDeprecationWarnings = true;

class JiraClient {

    constructor(baseURL, username, password) {
        this.baseURL = baseURL;
        this.auth = Buffer.from(`${username}:${password}`).toString('base64');
    }

    async updateIssue(issueKey, issueData) {
        try {
            const response = await axios.put(`${this.baseURL}/rest/api/2/issue/${issueKey}`, {
                fields: issueData
            }, {
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error updating issue:', error.response.data);
            throw error;
        }
    }


    async listProjects() {

        try {
        
            
            const response = await axios.get(`${this.baseURL}/rest/api/2/project`, {
                headers: {
                    'Authorization': `Basic ${this.auth}`
                }
            });
            
                
            return response.data.filter(a => JSON.parse(fs.readFileSync('./config.json', 'utf8')).projects.map(b => b.id || b.title).includes(a.key))


        } catch (error) {
            console.error('Error listing projects:', error);
            throw error;
        }
        
    }

    async listIssues(jql) {

        let issues = [];
        let startAt = 0;
        const maxResults = 100;

        try {
            while (true) {
                const response = await axios.get(`${this.baseURL}/rest/api/2/search`, {
                    headers: {
                        'Authorization': `Basic ${this.auth}`
                    },
                    params: {
                        jql: jql,
                        startAt: startAt,
                        maxResults: maxResults
                    }
                });

                issues = issues.concat(response.data.issues);

                if (response.data.issues.length < maxResults) {
                    break; // Stop if there are no more issues to fetch
                }

                startAt += maxResults;
            }

            return issues;
        } catch (error) {
            console.error('Error listing issues:', error);
            throw error;
        }
    }


    async createIssue(issueData) {
        try {
            const response = await axios.post(`${this.baseURL}/rest/api/2/issue`, issueData, {
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error creating issue:', error.response.data);
            throw error;
        }
    }

    async getTransitions(issueKey) {
        try {
            const response = await axios.get(`${this.baseURL}/rest/api/3/issue/${issueKey}/transitions`, {
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error creating issue:', error.response.data);
            throw error;
        }
    }

    async updateStatus(issueKey, statusId) {
        try {
            const response = await axios.post(`${this.baseURL}/rest/api/2/issue/${issueKey}/transitions`, {
                transition: { id: statusId }
            }, {
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error creating issue:', error.response.data);
            throw error;
        }
    }

}

function calculateCompletion(data) {

    const doneItems = data.filter(item => item.done);
    const pendingItems = data.filter(item => !item.done);

    const totalTasks = doneItems.length + pendingItems.length;
    const donePercent = totalTasks > 0 ? (doneItems.length / totalTasks) * 100 : 0;
    const pendingPercent = totalTasks > 0 ? (pendingItems.length / totalTasks) * 100 : 0;

    const totalTimeSpent = data.reduce((sum, item) => sum + (item.fields?.timespent || 0), 0);
    const totalEstimate = data.reduce((sum, item) => sum + (item.fields?.timeoriginalestimate || 0), 0);

    const timeBasedDonePercent = totalEstimate > 0 ? (totalTimeSpent / totalEstimate) * 100 : 0;

    const pendingTimeSpent = pendingItems.reduce((sum, item) => sum + (item.fields?.timespent || 0), 0);
    const pendingTimeSpentHours = (pendingTimeSpent / 3600).toFixed(1); // Convert seconds to hours

    return {
        done: doneItems,
        pending: pendingItems,
        donePercent: donePercent.toFixed(0),
        pendingPercent: pendingPercent.toFixed(0),
        timeBasedDonePercent: timeBasedDonePercent.toFixed(0),
        pendingTimeSpentHours,
        percent: Math.floor((donePercent + timeBasedDonePercent) >= 100 ? 100 : Number(donePercent + timeBasedDonePercent))
    };
}

// const jira = new JiraClient(
//     config.jira_url, 
//     config.jira_email, 
//     config.jira_api_key
// );

async function jira(jira_url) {
    return new JiraClient(
        (jira_url || config.jira_url), 
        config.jira_email, 
        config.jira_api_key
    )
}


app.use(express.static('public'))


function createFile(filename) {

    return new Promise((resolve) => {

        fs.open(filename, async (err, fd) => {
            if (err) {
              fs.writeFile(filename, '[]', async (err) => {
                  await reSyncData()
                  resolve()
              });
            } else {
                resolve()
            }
        })

    })

}

app.get('/api', async (req, res) => {

    try {

        // check if data exists, if not created it. 
        await createFile('./data.json')
    
        let rawData = fs.readFileSync('data.json')
            rawData = JSON.parse(rawData)

        let data = JSON.parse(fs.readFileSync('./config.json', 'utf8')).projects.map(a => {

          var project = rawData.find(b => {
            if (a.jira) return (b.id || b.title) === (a.id || a.title) && a.jira === b.jiraUrl
            return (b.id || b.title) === (a.id || a.title)
          })

          a.active = false

          a.tasks = project && project.issues ? project.issues : []

            if (a.filter) a.tasks = a.filter(a.tasks)
            
            if (a.epic) {
                a.tasks = a.tasks.filter((issue) => issue.fields.parent && issue.fields.parent.key === a.epic)
            }

            a.tasks = a.tasks.map(issue => {

                issue.sla = issue.fields.labels && issue.fields.labels.includes('SLA')

                if (project.jira) issue.jiraUrl = project.jira

                issue.readyForProd = 
                issue.fields.status.name === "QA Done (Staging)" ||
                issue.fields.status.name === "Ready for Prod"


                issue.pending = issue.fields.status.name === "In Development" || 
                issue.fields.status.name === "PM Review" ||
                issue.fields.status.name === "In Progress" || 
                issue.fields.status.name === "Feedback" || 
                issue.fields.status.name === "QA Review" || 
                issue.fields.status.name === "Re-opened" || 
                issue.fields.status.name === "Ready For Dev" || 
                issue.fields.status.name === "QA Done (Staging)" ||
                issue.fields.status.name === "QA Done (Production)" ||
                issue.fields.status.name === "Ready for QA (Staging)" || 
                issue.fields.status.name === "Ready for QA (Production)"

                issue.done = issue.fields.status.name === "Done" || 
                issue.fields.status.name === "Developed" || 
                issue.fields.status.name === "Closed" || 
                issue.fields.status.name === "Resolved" || 
                issue.fields.status.name === "Published" || 
                issue.fields.status.name === "Ready for Prod" || 
                issue.fields.status.name === "Cancelled"

                return issue

            })

          var milestone_based = a.tasks.find(b => b.fields && b.fields.labels && (b.fields.labels.includes('Milestone-1') || b.fields.labels.includes('Milestone-4')))

          var sprint_based = a.tasks.find(b => b.fields && b.fields.labels && (b.fields.labels.includes('Sprint-1') || b.fields.labels.includes('Sprint-9')))

          if (milestone_based || sprint_based) {

            var milestones = []

            a.tasks.map(a => {
              if (a.fields.labels) a.fields.labels.map(b => {
                if (!milestones.includes(b)) milestones.push(b)
              })
            })

            a.milestones = []


            milestones.map(milestone => {

              var tasks = a.tasks
              .filter(b => b.fields && b.fields.labels && b.fields.labels.includes(milestone))
              .sort((a, b) => {
                  return Number(a.key.split('-')[1]) - Number(b.key.split('-')[1])
              }).sort((a, b) => {
                const getStatusRank = task => task.done ? 2 : task.pending ? 1 : 0;
                return getStatusRank(b) - getStatusRank(a);
              });

              a.milestones.push({
                  title: milestone.split('-').join(' '),
                  tasks,
                  percent: calculateCompletion(tasks).percent
              })

            })

            function calculateActualProgress(milestones) {
              if (milestones.length === 0) return 0;
              const totalPercent = milestones.reduce((sum, milestone) => sum + milestone.percent, 0);
              return Number(totalPercent / milestones.length).toFixed(0);
            }

            a.milestones = a.milestones.sort((a, b) => {
              const getPriority = (title) => {
                if (title === 'SLA') return [0, 0];
                
                const sprintMatch = title.match(/^Sprint (\d+)$/);
                if (sprintMatch) return [1, -parseInt(sprintMatch[1], 10)]; // Sprint DESC

                const milestoneMatch = title.match(/^Milestone (\d+)$/);
                if (milestoneMatch) return [2, parseInt(milestoneMatch[1], 10)]; // Milestone ASC

                return [3, title]; // Others alphabetical
              };

              const [priorityA, valueA] = getPriority(a.title);
              const [priorityB, valueB] = getPriority(b.title);

              if (priorityA !== priorityB) return priorityA - priorityB;

              if (typeof valueA === 'number' && typeof valueB === 'number') {
                return valueA - valueB;
              }

              return String(valueA).localeCompare(String(valueB));
            });

            // console.log( a.milestones )

            a.percent = calculateActualProgress(a.milestones)

          } else {

            a.percent = calculateCompletion(a.tasks).percent

          }

          return a

        })

        if (req.query.project) {
            data = data.filter(a => (a.id || a.title) === req.query.project)
        }

        return res.json({ projects: data, config: { 
            email: config.jira_email,
            jira_url: config.jira_url,
            watch: config.watch,
            screens: config.screens
        } })

    } catch(e) {

        return res.json({ error: true })

    }


})


app.post('/refresh/:key', async (req, res) => {


    let projects = fs.readFileSync('data.json')
        projects = JSON.parse(projects)

    for (var project of projects) {

        if (req.body.jira && project.jira === req.body.jira && (project.id || project.title) === req.params.key) {
            project.issues = await (await jira(project.jira)).listIssues(`project=${project.id || project.title}`)
            continue;
        }

        if ((project.id || project.title) === req.params.key) {
            project.issues = await (await jira(project.jira)).listIssues(`project=${project.id || project.title}`)
        }

    }

    fs.writeFileSync('data.json', JSON.stringify(projects))

    return res.json()

})


app.get('/reminders', async (req, res) => {

    try {

        await createFile('./reminders.json')

        let rawData = fs.readFileSync('reminders.json')

        res.send( JSON.parse(rawData) )

    } catch(e) {

        res.send( [] )

    }

})

app.post('/reminders', async (req, res) => {

    let rawData = fs.readFileSync('reminders.json')
        rawData = JSON.parse(rawData)
        rawData = Array.isArray(rawData) ? rawData : []

    req.body.id = Math.random().toString(16).slice(2)

    rawData.push(req.body)

    fs.writeFileSync('reminders.json', JSON.stringify(rawData))

    res.send({ success: true })
    
})

app.post('/reminders/:id', async (req, res) => {

    let rawData = fs.readFileSync('reminders.json')
        rawData = JSON.parse(rawData)


    rawData = rawData.map(item => {
        if (item.id === req.params.id) {
            item = req.body
        }
        return item
    })

    fs.writeFileSync('reminders.json', JSON.stringify(rawData))

    res.send({ success: true })
    
})


app.delete('/reminders/:id', async (req, res) => {

    let rawData = fs.readFileSync('reminders.json')
        rawData = JSON.parse(rawData)
        rawData = Array.isArray(rawData) ? rawData : []

    rawData = rawData.filter(a => a.id !== req.params.id)

    fs.writeFileSync('reminders.json', JSON.stringify(rawData))

    res.send({ success: true })
    
})


app.post('/tasks', async (req, res) => {


    var createResponse = await (await jira(req.body.jira)).createIssue({
        fields: {
            project: { key: req.body.project },
            summary: req.body.title,
            description: req.body.description,
            customfield_10008: req.body.startdate,
            duedate: req.body.duedate,
            issuetype: { name: "Task" },
            assignee: config.jira_account_id ? { accountId: config.jira_account_id } : null,
            parent: req.body.parent ? { key: req.body.parent } : null
        }
    })

    var transitions = await ((await jira()).getTransitions(createResponse.key)).transitions


    if (transitions) await (await jira()).updateStatus(createResponse.key, transitions.find(a => a.name === 'In Progress').id)


    return res.json( transitions )


})


app.post('/update/item/:key', async (req, res) => {

    await (await jira()).updateIssue(req.params.key, req.body)

    let projects = fs.readFileSync('data.json')
        projects = JSON.parse(projects)

    for (var project of projects) {
        if (project.key === req.params.key.split('-')[0]) {
            for (var issue of project.issues) {
                if (issue.key === req.params.key) {
                    Object.keys(req.body).map(a => issue.fields[a] = req.body[a])
                }
            }
        }
    }

    fs.writeFileSync('data.json', JSON.stringify(projects))

    res.json({ success: true })

})

// mac osx os only
// todo: make it detect os and work for both mac and windows
app.post('/email', async (req, res) => {

    const recipients = req.body.people.map(a => `make new recipient at newMessage with properties {email address:{address:"${a.email}"}}`).join('\n        ');
    const subject = `${req.body.title} - `; // Define subject if needed
    const body = ''; // Define body if needed

    // Your updated AppleScript command
    const appleScript = `
    tell application "Microsoft Outlook"
        set newMessage to make new outgoing message
        set subject of newMessage to "${subject}"
        set content of newMessage to "${body}"
        ${recipients}
        open newMessage
        activate -- Bring Outlook to the front
    end tell
    `;

    child.exec(`osascript -e '${appleScript}'`, (err, stdout, stderr) => {
        res.json({ success: req.body })
    });
    

})


async function reSyncData() {
    try {

        console.log('Fetching new data...')

        var activeProjects = JSON.parse(fs.readFileSync('./config.json', 'utf8')).projects

        var projects = []

        var uniqueProjects = []

        activeProjects.map(a => {
            if (!uniqueProjects.find(b => a.id === (b.id || b.title) || a.title === (b.id || b.title))) {
                uniqueProjects.push(a)
            }
        })

        // var projects = await (await jira()).listProjects()

        for (const project of uniqueProjects) {

            project.issues = await (await jira(project.jira)).listIssues(`project=${project.id || project.title}`)

            if (project.jira) project.jiraUrl = project.jira

            console.log('Saved data for: ' + (project.id || project.title))

            projects.push(project)

        }

        let data = JSON.stringify(projects)

        fs.writeFileSync('data.json', data)

        console.log('Loaded new data.')
        
    } catch (error) {

        console.error('Error:', error)

    }
}

setInterval(async () => {

    await reSyncData()

}, config.refresh || 300000) // 5 minutes in ms, due to jira rate limits

app.listen(process.argv[2] || 8090)

console.log("http://localhost:" + (process.argv[2] || 8090))