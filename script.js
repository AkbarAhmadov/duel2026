const CSV_FILE = 'veriler.csv';

// --- CONFIGURATION: TOURNAMENT DATES ---
// Tarih Formatı: YYYY-MM-DDTHH:MM:SS (T harfine dikkat)
const tournamentSchedule = [
    { 
        name: "Round 1", 
        start: "2026-02-15T13:00:00", 
        end:   "2026-02-15T13:30:00" 
    },
    
];

// Global Variables
let currentLeaderboardData = [];
let currentHeaders = [];
let globalRoundHeaders = [];

// --- ON PAGE LOAD ---
window.onload = function() {
    // 1. Timerları Başlat
    startCountdowns();

    // 2. Verileri Çek
    fetch(CSV_FILE)
        .then(res => {
            if (!res.ok) throw new Error("CSV file not found! (veriler.csv)");
            return res.text();
        })
        .then(csvText => {
            const { headers, data } = parseCSV(csvText);
            const processed = processLeaderboard(headers, data);
            
            currentHeaders = processed.displayHeaders;
            globalRoundHeaders = processed.roundHeaders;
            currentLeaderboardData = processed.leaderboard;
            
            renderTable();
            renderDuels(processed.roundHeaders, data);
        })
        .catch(err => {
            document.getElementById('loading').innerHTML = `Error: ${err.message}`;
            document.getElementById('loading').style.color = "var(--loser)";
        });
};

// --- TIMER FUNCTIONS (NEW) ---
function startCountdowns() {
    // Saniyelik güncelleme
    setInterval(() => {
        updateGameTimer();
        updateServerTime();
    }, 1000);
    // İlk açılışta hemen çalıştır
    updateGameTimer();
    updateServerTime();
}

function updateGameTimer() {
    const now = new Date();
    const timerLabel = document.getElementById("timerLabel");
    const countdownDiv = document.getElementById("countdown");
    const liveDiv = document.getElementById("liveStatus");

    let targetDate = null;
    let isLive = false;
    let nextRoundName = "";

    // Takvimi kontrol et
    for (let round of tournamentSchedule) {
        const start = new Date(round.start);
        const end = new Date(round.end);

        if (now < start) {
            // Gelecek round bulundu
            targetDate = start;
            nextRoundName = round.name;
            break;
        } else if (now >= start && now <= end) {
            // Şu an round oynanıyor
            isLive = true;
            break;
        }
    }

    if (isLive) {
        timerLabel.style.display = "none";
        countdownDiv.style.display = "none";
        liveDiv.style.display = "flex";
    } else if (targetDate) {
        timerLabel.style.display = "block";
        countdownDiv.style.display = "flex";
        liveDiv.style.display = "none";
        
        timerLabel.innerText = `${nextRoundName} STARTS IN:`;
        
        const diff = targetDate - now;
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        document.getElementById("t-days").innerText = days;
        document.getElementById("t-hours").innerText = hours.toString().padStart(2, '0');
        document.getElementById("t-minutes").innerText = minutes.toString().padStart(2, '0');
        document.getElementById("t-seconds").innerText = seconds.toString().padStart(2, '0');
    } else {
        // Turnuva bitti veya tarih yok
        timerLabel.innerText = "TOURNAMENT ENDED";
        countdownDiv.style.display = "none";
        liveDiv.style.display = "none";
    }
}

function updateServerTime() {
    // UTC+4 Hesaplama
    const now = new Date();
    // UTC zamanını alıp 4 saat ekliyoruz
    const utcPlus4 = new Date(now.getTime() + (4 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60000));
    
    const yyyy = utcPlus4.getFullYear();
    const mm = String(utcPlus4.getMonth() + 1).padStart(2, '0');
    const dd = String(utcPlus4.getDate()).padStart(2, '0');
    const hh = String(utcPlus4.getHours()).padStart(2, '0');
    const min = String(utcPlus4.getMinutes()).padStart(2, '0');
    const ss = String(utcPlus4.getSeconds()).padStart(2, '0');

    const timeString = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} UTC+4`;
    document.getElementById("serverTime").innerText = `Server Time: ${timeString}`;
}

// --- CSV & DATA PROCESSING (UNCHANGED) ---
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const delimiter = lines[0].includes(';') ? ';' : ','; 
    const headers = lines[0].split(delimiter).map(h => h.trim());
    
    const data = lines.slice(1).map(line => {
        if(line.trim() === "") return null;
        const values = line.split(delimiter).map(v => v.trim());
        let obj = {};
        headers.forEach((header, i) => {
            obj[header] = values[i];
        });
        return obj;
    }).filter(row => row !== null);
    
    return { headers, data };
}

function processLeaderboard(headers, data) {
    const roundHeaders = headers.filter(h => h.toLowerCase().startsWith('round'));
    const displayHeaders = headers.filter(h => 
        !h.toLowerCase().startsWith('solved') && 
        h !== 'Username' && h !== 'CodeforcesHandle' && h !== 'R1_Opponent'
    );

    let leaderboard = data.map(row => {
        let totalScore = 0;
        let totalSolved = 0;
        let rounds = {};
        let roundsSolved = {};

        roundHeaders.forEach(roundName => {
            let score = Math.round(parseFloat(row[roundName])) || 0;
            rounds[roundName] = score;
            totalScore += score;
            let roundNum = roundName.split(' ')[1]; 
            let solvedCount = parseInt(row[`Solved ${roundNum}`]) || 0;
            roundsSolved[roundName] = solvedCount;
            totalSolved += solvedCount;
        });

        return {
            username: row.Username || "Unknown",
            rounds: rounds,            
            roundsSolved: roundsSolved,
            totalScore: totalScore,
            totalSolved: totalSolved,
            cfHandle: row['CodeforcesHandle'] || null,
            r1Opponent: row['R1_Opponent'] || null
        };
    });

    leaderboard.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return b.totalSolved - a.totalSolved;
    });

    return { displayHeaders, leaderboard, roundHeaders };
}

// --- DUEL RENDER (WITH NEW UI) ---
function renderDuels(roundHeaders, rawData) {
    const duelsWrapper = document.getElementById('duelsWrapper');
    duelsWrapper.innerHTML = '';

    let players = rawData.map(row => {
        let p = { 
            username: row.Username, 
            rounds: {}, 
            historyScore: 0, 
            historySolved: 0 
        };
        roundHeaders.forEach(rName => {
            p.rounds[rName] = Math.round(parseFloat(row[rName])) || 0;
        });
        p.r1Opponent = row.R1_Opponent;
        return p;
    });

    roundHeaders.forEach((roundName, roundIndex) => {
        let matchesHTML = '';
        let pairedUsers = new Set(); 

        if (roundIndex === 0) {
            players.forEach(p1 => {
                if (pairedUsers.has(p1.username)) return;
                let p2 = players.find(p => p.username === p1.r1Opponent);
                if (p2) {
                    matchesHTML += createMatchHTML(p1, p2, roundName);
                    pairedUsers.add(p1.username);
                    pairedUsers.add(p2.username);
                }
            });
        } else {
             players.forEach(p => {
                let currentTotalScore = 0;
                for (let i = 0; i < roundIndex; i++) {
                    currentTotalScore += p.rounds[roundHeaders[i]];
                }
                p.historyScore = currentTotalScore;
            });
            let sortedPlayers = [...players].sort((a, b) => b.historyScore - a.historyScore || a.username.localeCompare(b.username));
            for (let i = 0; i < sortedPlayers.length; i += 2) {
                if (i + 1 < sortedPlayers.length) matchesHTML += createMatchHTML(sortedPlayers[i], sortedPlayers[i+1], roundName);
            }
        }

        const accordionHTML = `
            <div class="accordion-item">
                <div class="accordion-header" onclick="toggleAccordion(this)">
                    ${roundName} <span>▼</span>
                </div>
                <div class="accordion-content">
                    ${matchesHTML || '<p style="text-align:center;color:gray;padding:10px;">Waiting...</p>'}
                </div>
            </div>
        `;
        duelsWrapper.innerHTML += accordionHTML;
    });
}

function createMatchHTML(p1, p2, roundName) {
    let s1 = p1.rounds[roundName];
    let s2 = p2.rounds[roundName];
    let leftUser = p1, rightUser = p2;
    let leftScore = s1, rightScore = s2;
    let leftClass = "", rightClass = "", leftScoreClass = "", rightScoreClass = "";

    if (s1 > s2) {
        leftClass = "winner"; rightClass = "loser";
        leftScoreClass = "winner-score"; rightScoreClass = "loser-score";
    } else if (s2 > s1) {
        leftClass = "loser"; rightClass = "winner";
        leftScoreClass = "loser-score"; rightScoreClass = "winner-score";
    }

    return `
        <div class="match-card">
            <div class="player-info left ${leftClass}" title="${leftUser.username}">${leftUser.username}</div>
            <div class="score-board">
                <span class="score-num ${leftScoreClass}">${leftScore}</span>
                <span class="vs-badge">VS</span>
                <span class="score-num ${rightScoreClass}">${rightScore}</span>
            </div>
            <div class="player-info right ${rightClass}" title="${rightUser.username}">${rightUser.username}</div>
        </div>
    `;
}

function toggleAccordion(header) {
    const content = header.nextElementSibling;
    const isActive = content.classList.contains('active');
    document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));
    if (!isActive) content.classList.add('active');
}

// --- TABLE & MODAL (UNCHANGED) ---
function sortData(criteria) {
    currentLeaderboardData.sort((a, b) => {
        let valA = (criteria === 'totalScore') ? a.totalScore : (criteria === 'totalSolved' ? a.totalSolved : (a.rounds[criteria] || 0));
        let valB = (criteria === 'totalScore') ? b.totalScore : (criteria === 'totalSolved' ? b.totalSolved : (b.rounds[criteria] || 0));
        return valB - valA || b.totalScore - a.totalScore;
    });
    renderTable();
}

function renderTable() {
    const tableHead = document.querySelector('#leaderboard thead tr');
    const tableBody = document.getElementById('tableBody');
    let headerHTML = `<th>Rank</th><th>Username</th>`;
    globalRoundHeaders.forEach(round => headerHTML += `<th onclick="sortData('${round}')">${round}</th>`);
    headerHTML += `<th onclick="sortData('totalSolved')">Total Solved</th><th onclick="sortData('totalScore')">Total Score</th>`;
    tableHead.innerHTML = headerHTML;

    tableBody.innerHTML = '';
    currentLeaderboardData.forEach((user, index) => {
        let roundCells = '';
        globalRoundHeaders.forEach(round => roundCells += `<td>${user.rounds[round]}</td>`);
        tableBody.innerHTML += `
            <tr onclick="openModal('${user.username}', '${user.cfHandle}')">
                <td>${index + 1}</td>
                <td class="user-name-cell">${user.username}</td>
                ${roundCells}
                <td class="solved-cell">${user.totalSolved}</td>
                <td class="total-cell">${user.totalScore}</td>
            </tr>`;
    });
    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'flex';
}

const modal = document.getElementById("userModal");
const closeBtn = document.querySelector(".close-btn");
closeBtn.onclick = () => modal.style.display = "none";
window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

function openModal(username, cfHandle) {
    modal.style.display = "block";
    document.getElementById("modalUsername").innerText = username;
    const handleLink = document.getElementById("cfHandleLink");
    handleLink.innerText = cfHandle || "Not linked";
    handleLink.href = "#"; 
    document.getElementById("cfRating").innerText = "-";
    document.getElementById("cfMaxRating").innerText = "-";
    document.getElementById("cfRank").innerText = "-";
    document.getElementById("cfSolved").innerText = "-";
    if (cfHandle && cfHandle.trim()) fetchCodeforcesStats(cfHandle.trim());
}

async function fetchCodeforcesStats(handle) {
    try {
        const infoRes = await fetch(`https://codeforces.com/api/user.info?handles=${handle}`);
        const infoData = await infoRes.json();
        if (infoData.status === "OK") {
            const user = infoData.result[0];
            const link = document.getElementById("cfHandleLink");
            link.href = `https://codeforces.com/profile/${handle}`;
            const rElem = document.getElementById("cfRating");
            rElem.innerText = user.rating || "Unrated";
            document.getElementById("cfMaxRating").innerText = user.maxRating || "Unrated";
            document.getElementById("cfRank").innerText = user.rank || "Unrated";
            if (user.rating >= 2400) rElem.style.color="#FF0000";
            else if (user.rating >= 2100) rElem.style.color="#FF8C00";
            else if (user.rating >= 1900) rElem.style.color="#AA00AA";
            else if (user.rating >= 1600) rElem.style.color="#0000FF";
            else if (user.rating >= 1400) rElem.style.color="#03A89E";
            else if (user.rating >= 1200) rElem.style.color="#008000";
            else rElem.style.color="gray";
        }
        const stRes = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
        const stData = await stRes.json();
        if(stData.status==="OK"){
            const s = new Set();
            stData.result.forEach(x=>{if(x.verdict==="OK")s.add(x.problem.name)});
            document.getElementById("cfSolved").innerText = s.size;
        }
    } catch(e) { console.error(e); }
}

document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    document.getElementById('theme-toggle').innerText = document.body.classList.contains('light-mode') ? "☀️ Light Mode" : "🌙 Dark Mode";
});
