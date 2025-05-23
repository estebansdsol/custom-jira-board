var projects = []

window.item = null

window.close = function () {

    document.getElementById('popup').style.display = 'none'
    document.getElementById('popup-backdrop').style.display = 'none'

    var title = document.getElementById('title')
    var start_time = document.getElementById('start_time')
    var end_time = document.getElementById('end_time')

    axios.post('/api', { id: item.id, start: start_time.value, end: end_time.value }).then((res) => {


        for (var i = 0; i < Calendar.Items.length; i++) {
            foundItem = Calendar.Items[i];

            if (foundItem.id === item.id) {
                foundItem.start = moment(start_time.value);
                foundItem.end = moment(end_time.value);

                Calendar.Items[i] = foundItem;
            }
        }

        TimeScheduler.Init();
        

    })

}

axios.get('/api').then((res) => {

    projects = res.data

    var today = moment().startOf('day');

    var items = []

    projects.filter(a => a).map(project => {
        project.issues
        .filter(issue => {
            if (issue.fields.summary.toLowerCase().includes('management hours')) return false
            if (issue.fields.parent && issue.fields.parent.fields.summary && ( issue.fields.parent.fields.summary.includes('QA') || issue.fields.parent.fields.summary.includes('Quality Assurance') )) return false
            return true
        })
        .map(issue => {
            
            var done = issue.fields.status.name === "Done" || issue.fields.status.name === "Developed" || issue.fields.status.name === "Closed" || issue.fields.status.name === "Resolved" || issue.fields.status.name === "Published"
            var todo = issue.fields.status.name !== "Done" && issue.fields.status.name !== "Developed" && issue.fields.status.name !== "Resolved" && issue.fields.status.name !== "Closed"
            var hours = issue.fields.timespent ? Math.floor(issue.fields.timespent / 3600) : 0

            var end = done ? moment(issue.fields.updated).endOf('day') : moment(today).add('days', 1)
            
            if (issue.fields.status.name.split(' ').join('-').toLowerCase() === 'to-do' || issue.fields.status.name.split(' ').join('-').toLowerCase() === 'backlog') {
                end = moment(today)
            }

            if ( issue.fields.status.name !== "To Do" ) {
                items.push({
                    id: issue.key,
                    name: `<div class="title">${issue.fields.summary}</div><di class="key">${issue.key}</div>`,
                    sectionID: project.id,
                    start: moment(issue.fields.customfield_10008 || issue.fields.created),
                    fields: issue.fields,
                    end,
                    classes: 'item-status-' + issue.fields.issuetype.name.toLowerCase() + ' ' + issue.fields.status.name.split(' ').join('-').toLowerCase(),
                })
            }

        })

    })

    window.Calendar = {

        Periods: [

            {
                Name: '1 week',
                Label: '1 week',
                TimeframePeriod: (60 * 24),
                TimeframeOverall: (60 * 24 * 7),
                TimeframeHeaders: [
                    'MMM',
                    'dddd, Do'
                ],
                Classes: 'period-1week'
            },

            {
                Name: '1 month',
                Label: '1 month',
                TimeframePeriod: (60 * 24 * 1),
                TimeframeOverall: (60 * 24 * 31),
                TimeframeHeaders: [
                    'MMM',
                    'Do'
                ],
                Classes: 'period-1month'
            }

        ],

        Items: items,

        Sections: projects.filter(a => a).map(a => {
            a.name = `<b>${a.name}</b> <br> ${a.contract ? a.contract.team_lead : 'N/A'}`
            return a
        }),

        Init: function () {

            TimeScheduler.Options.GetSections = Calendar.GetSections;

            TimeScheduler.Options.GetSchedule = Calendar.GetSchedule;
            
            TimeScheduler.Options.Start = moment().startOf('week').add(1, 'days');
            
            TimeScheduler.Options.Periods = Calendar.Periods;

            TimeScheduler.Options.SelectedPeriod = '1 month';

            TimeScheduler.Options.Element = $('.calendar');

            TimeScheduler.Options.AllowDragging = false;
            TimeScheduler.Options.AllowResizing = false;

            TimeScheduler.Options.Events.ItemClicked = Calendar.Item_Clicked;
            TimeScheduler.Options.Events.ItemDropped = Calendar.Item_Dragged;
            TimeScheduler.Options.Events.ItemResized = Calendar.Item_Resized;

            TimeScheduler.Options.Events.ItemMovement = Calendar.Item_Movement;
            TimeScheduler.Options.Events.ItemMovementStart = Calendar.Item_MovementStart;
            TimeScheduler.Options.Events.ItemMovementEnd = Calendar.Item_MovementEnd;

            TimeScheduler.Options.Text.NextButton = '&nbsp;';
            TimeScheduler.Options.Text.PrevButton = '&nbsp;';

            TimeScheduler.Options.MaxHeight = 100;

            TimeScheduler.Init();

        },

        GetSections: function (callback) {
            callback(Calendar.Sections);
        },


        GetSchedule: function (callback, start, end) {
            callback(Calendar.Items);
        },


        Item_Dragged: function (item, sectionID, start, end) {

            var foundItem;

            for (var i = 0; i < Calendar.Items.length; i++) {
                foundItem = Calendar.Items[i];

                if (foundItem.id === item.id) {
                    foundItem.sectionID = sectionID;
                    foundItem.start = start;
                    foundItem.end = end;

                    Calendar.Items[i] = foundItem;
                }
            }

            TimeScheduler.Init();

        },


        Item_Resized: function (item, start, end) {

            var foundItem;


            for (var i = 0; i < Calendar.Items.length; i++) {
                foundItem = Calendar.Items[i];

                if (foundItem.id === item.id) {
                    foundItem.start = start;
                    foundItem.end = end;

                    Calendar.Items[i] = foundItem;
                }
            }

            TimeScheduler.Init();

        },


        Item_Clicked: function (task) {

            window.open(`https://sdsoltech.atlassian.net/browse/${task.id}`, '_blank').focus();
 
        },

    };


    $(document).ready(Calendar.Init);

    if ( TimeScheduler.Options.SelectedPeriod === '1 month' ) {
        TimeScheduler.Options.Start = moment().startOf('month');
        TimeScheduler.Init();
    }


})
