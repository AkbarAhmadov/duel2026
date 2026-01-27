const CSV_FILE = 'veriler.csv';

window.onload = function() {
    fetch(CSV_FILE)
        .then(res => {
            if (!res.ok) throw new Error("CSV file not found!");
            return res.text();
        })
        .then(csvText => {
            const { headers, data } = parseCSV(csvText);
            const processedData = processLeaderboard(headers, data);
            renderTable(headers, processedData);
        })
        .catch(err => {
            document.getElementById('loading').innerText = "Error: " + err.message;
        });
};

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim());
    
    const data = lines.slice(1).map(line => {
        const values = line.split(delimiter).map(v => v.trim());
        let obj = {};
        headers.forEach((header, i) => {
            obj[header] = values[i];
        });
        return obj;
    });
    return { headers, data };
}

function processLeaderboard(headers, data) {
    const roundHeaders = headers.filter(h => h !== 'Username' && h !== 'Solved Problems');

    let leaderboard = data.map(row => {
        let total = 0;
        let rounds = {};

        roundHeaders.forEach(round => {
            // parseFloat ile alıp Math.round ile tam sayıya çeviriyoruz
            let score = Math.round(parseFloat(row[round])) || 0;
            rounds[round] = score;
            total += score;
        });

        return {
            username: row.Username || "Unknown",
            rounds: rounds,
            solvedProblems: parseInt(row['Solved Problems']) || 0,
            totalScore: total
        };
    });

    // Ranking: Score first (Integer), then Solved Problems
    leaderboard.sort((a, b) => {
        if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore;
        }
        return b.solvedProblems - a.solvedProblems;
    });

    return leaderboard;
}

function renderTable(headers, data) {
    const tableHead = document.querySelector('#leaderboard thead tr');
    const tableBody = document.getElementById('tableBody');
    const roundHeaders = headers.filter(h => h !== 'Username' && h !== 'Solved Problems');

    tableHead.innerHTML = `<th>Rank</th><th>Username</th>`;
    roundHeaders.forEach(round => tableHead.innerHTML += `<th>${round}</th>`);
    tableHead.innerHTML += `<th>Solved Problems</th><th>Total</th>`;

    tableBody.innerHTML = '';
    data.forEach((user, index) => {
        let roundCells = '';
        roundHeaders.forEach(round => {
            roundCells += `<td>${user.rounds[round]}</td>`;
        });

        const row = `
            <tr>
                <td>${index + 1}</td>
                <td class="user-name-cell">${user.username}</td>
                ${roundCells}
                <td class="solved-cell">${user.solvedProblems}</td>
                <td class="total-cell">${user.totalScore}</td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });

    document.getElementById('loading').style.display = 'none';
    document.getElementById('leaderboardWrapper').style.display = 'block';
}

// Dark Mode Toggle
const themeBtn = document.getElementById('theme-toggle');
themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    themeBtn.innerText = document.body.classList.contains('light-mode') ? "☀️ Light Mode" : "🌙 Dark Mode";
});