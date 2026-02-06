const CSV_FILE = 'veriler.csv';

// Global Variables
let currentLeaderboardData = [];
let currentHeaders = [];      // Headers to show in table
let globalRoundHeaders = [];  // Headers for "Round X" (for pairing logic)

// --- ON PAGE LOAD ---
window.onload = function() {
    fetch(CSV_FILE)
        .then(res => {
            if (!res.ok) throw new Error("CSV file not found! (veriler.csv)");
            return res.text();
        })
        .then(csvText => {
            const { headers, data } = parseCSV(csvText);
            const processed = processLeaderboard(headers, data);
            
            // Save data
            currentHeaders = processed.displayHeaders;
            globalRoundHeaders = processed.roundHeaders;
            currentLeaderboardData = processed.leaderboard;
            
            // 1. Render Leaderboard
            renderTable();
            
            // 2. Render Duels (Swiss System)
            renderDuels(processed.roundHeaders, data);
        })
        .catch(err => {
            document.getElementById('loading').innerHTML = `Error: ${err.message}<br><small>Please make sure to run this via Live Server.</small>`;
            document.getElementById('loading').style.color = "var(--loser)";
        });
};

// --- CSV PARSING ---
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

// --- DATA PROCESSING ---
function processLeaderboard(headers, data) {
    // 1. Find columns starting with "Round"
    const roundHeaders = headers.filter(h => h.toLowerCase().startsWith('round'));
    
    // 2. Filter headers for display (Hide Solved X, R1_Opponent, etc.)
    const displayHeaders = headers.filter(h => 
        !h.toLowerCase().startsWith('solved') && 
        h !== 'Username' && 
        h !== 'CodeforcesHandle' && 
        h !== 'R1_Opponent'
    );

    let leaderboard = data.map(row => {
        let totalScore = 0;
        let totalSolved = 0;
        let rounds = {};
        let roundsSolved = {};

        roundHeaders.forEach(roundName => {
            // Get Score
            let score = Math.round(parseFloat(row[roundName])) || 0;
            rounds[roundName] = score;
            totalScore += score;

            // Get Correlated Solved Count (e.g. "Round 1" -> "Solved 1")
            let roundNum = roundName.split(' ')[1]; 
            let solvedColName = `Solved ${roundNum}`;
            
            let solvedCount = parseInt(row[solvedColName]) || 0;
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

    // Default Sorting: Total Score -> Total Solved
    leaderboard.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return b.totalSolved - a.totalSolved;
    });

    return { displayHeaders, leaderboard, roundHeaders };
}

// --- DUEL SYSTEM LOGIC (SWISS SYSTEM) ---
function renderDuels(roundHeaders, rawData) {
    const duelsWrapper = document.getElementById('duelsWrapper');
    duelsWrapper.innerHTML = '';

    // Create player objects from raw data for calculation
    let players = rawData.map(row => {
        let p = { 
            username: row.Username, 
            rounds: {}, 
            roundsSolved: {},
            historyScore: 0, 
            historySolved: 0 
        };
        
        roundHeaders.forEach(rName => {
            p.rounds[rName] = Math.round(parseFloat(row[rName])) || 0;
            let roundNum = rName.split(' ')[1];
            p.roundsSolved[rName] = parseInt(row[`Solved ${roundNum}`]) || 0;
        });
        
        p.r1Opponent = row.R1_Opponent;
        return p;
    });

    // Iterate through each round
    roundHeaders.forEach((roundName, roundIndex) => {
        let matchesHTML = '';
        let pairedUsers = new Set(); 

        // --- ROUND 1: Pair based on Excel "R1_Opponent" ---
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
        } 
        
        // --- ROUND 2+: Pair based on Ranking (Swiss) ---
        else {
            // Calculate scores UP TO this round (exclusive)
            players.forEach(p => {
                let currentTotalScore = 0;
                let currentTotalSolved = 0;
                
                for (let i = 0; i < roundIndex; i++) {
                    let rKey = roundHeaders[i];
                    currentTotalScore += p.rounds[rKey];
                    currentTotalSolved += p.roundsSolved[rKey];
                }
                
                p.historyScore = currentTotalScore;
                p.historySolved = currentTotalSolved;
            });

            // Sort: Score -> Solved -> Name
            let sortedPlayers = [...players].sort((a, b) => {
                if (b.historyScore !== a.historyScore) return b.historyScore - a.historyScore;
                if (b.historySolved !== a.historySolved) return b.historySolved - a.historySolved;
                return a.username.localeCompare(b.username);
            });

            // Pair 1vs2, 3vs4...
            for (let i = 0; i < sortedPlayers.length; i += 2) {
                if (i + 1 < sortedPlayers.length) {
                    let p1 = sortedPlayers[i];
                    let p2 = sortedPlayers[i+1];
                    matchesHTML += createMatchHTML(p1, p2, roundName);
                }
            }
        }

        // Add Accordion Item
        const accordionHTML = `
            <div class="accordion-item">
                <div class="accordion-header" onclick="toggleAccordion(this)">
                    ${roundName} <span>▼</span>
                </div>
                <div class="accordion-content">
                    ${matchesHTML || '<p style="text-align:center;color:gray;padding:10px;">Waiting for pairings...</p>'}
                </div>
            </div>
        `;
        duelsWrapper.innerHTML += accordionHTML;
    });
}

function createMatchHTML(p1, p2, roundName) {
    let s1 = p1.rounds[roundName];
    let s2 = p2.rounds[roundName];

    // Varsayılan: p1 solda, p2 sağda
    let leftUser = p1;
    let rightUser = p2;
    let leftScore = s1;
    let rightScore = s2;
    
    // CSS Sınıfları
    let leftClass = "";
    let rightClass = "";
    let leftScoreClass = "";
    let rightScoreClass = "";

    if (s1 > s2) {
        // Sol Kazandı
        leftClass = "winner";
        rightClass = "loser";
        leftScoreClass = "winner-score";
        rightScoreClass = "loser-score";
    } else if (s2 > s1) {
        // Sağ Kazandı
        leftClass = "loser";
        rightClass = "winner";
        leftScoreClass = "loser-score";
        rightScoreClass = "winner-score";
    } else {
        // Berabere
        leftScoreClass = "draw-score";
        rightScoreClass = "draw-score";
    }

    return `
        <div class="match-card">
            <div class="player-info left ${leftClass}" title="${leftUser.username}">
                ${leftUser.username}
            </div>

            <div class="score-board">
                <span class="score-num ${leftScoreClass}">${leftScore}</span>
                <span class="vs-badge">VS</span>
                <span class="score-num ${rightScoreClass}">${rightScore}</span>
            </div>

            <div class="player-info right ${rightClass}" title="${rightUser.username}">
                ${rightUser.username}
            </div>
        </div>
    `;
}

// Toggle Accordion
function toggleAccordion(header) {
    const content = header.nextElementSibling;
    const isActive = content.classList.contains('active');
    // Close others
    document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));
    // Open current
    if (!isActive) content.classList.add('active');
}

// --- TABLE SORTING & RENDERING ---
function sortData(criteria) {
    currentLeaderboardData.sort((a, b) => {
        let valA, valB;
        if (criteria === 'totalScore') {
            valA = a.totalScore; valB = b.totalScore;
        } else if (criteria === 'totalSolved') {
            valA = a.totalSolved; valB = b.totalSolved;
        } else {
            // Round Score
            valA = a.rounds[criteria] || 0;
            valB = b.rounds[criteria] || 0;
        }

        if (valB !== valA) return valB - valA;
        // Tie-breaker: Total Score
        return b.totalScore - a.totalScore;
    });
    renderTable();
}

function renderTable() {
    const tableHead = document.querySelector('#leaderboard thead tr');
    const tableBody = document.getElementById('tableBody');

    // Headers
    let headerHTML = `<th>Rank</th><th>Username</th>`;
    globalRoundHeaders.forEach(round => {
        headerHTML += `<th onclick="sortData('${round}')">${round}</th>`;
    });
    headerHTML += `<th onclick="sortData('totalSolved')">Total Solved</th>`;
    headerHTML += `<th onclick="sortData('totalScore')">Total Score</th>`;
    
    tableHead.innerHTML = headerHTML;

    // Rows
    tableBody.innerHTML = '';
    currentLeaderboardData.forEach((user, index) => {
        let roundCells = '';
        globalRoundHeaders.forEach(round => {
            roundCells += `<td>${user.rounds[round]}</td>`;
        });

        const rowHTML = `
            <tr onclick="openModal('${user.username}', '${user.cfHandle}')">
                <td>${index + 1}</td>
                <td class="user-name-cell">${user.username}</td>
                ${roundCells}
                <td class="solved-cell">${user.totalSolved}</td>
                <td class="total-cell">${user.totalScore}</td>
            </tr>
        `;
        tableBody.innerHTML += rowHTML;
    });

    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'flex';
}

// --- MODAL & API ---
const modal = document.getElementById("userModal");
const closeBtn = document.querySelector(".close-btn");
closeBtn.onclick = () => modal.style.display = "none";
window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

function openModal(username, cfHandle) {
    modal.style.display = "block";
    document.getElementById("modalUsername").innerText = username;
    const handleLink = document.getElementById("cfHandleLink");
    const loader = document.getElementById("modalLoader");
    
    // Reset
    handleLink.innerText = cfHandle || "Not linked";
    handleLink.href = "#"; handleLink.removeAttribute("href");
    document.getElementById("cfRating").innerText = "-";
    document.getElementById("cfMaxRating").innerText = "-";
    document.getElementById("cfRank").innerText = "-";
    document.getElementById("cfSolved").innerText = "-";
    document.getElementById("cfRating").style.color = "var(--text-main)";

    if (cfHandle && cfHandle.trim()) {
        fetchCodeforcesStats(cfHandle.trim());
    } else {
        handleLink.innerText = "No Codeforces Account";
    }
}

async function fetchCodeforcesStats(handle) {
    const loader = document.getElementById("modalLoader");
    loader.style.display = "block";
    try {
        // User Info
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
            
            // Rating Colors
            if (user.rating) {
                if(user.rating>=2400) rElem.style.color="#FF0000";
                else if(user.rating>=2100) rElem.style.color="#FF8C00";
                else if(user.rating>=1900) rElem.style.color="#AA00AA";
                else if(user.rating>=1600) rElem.style.color="#0000FF";
                else if(user.rating>=1400) rElem.style.color="#03A89E";
                else if(user.rating>=1200) rElem.style.color="#008000";
                else rElem.style.color="#808080";
            }
        }

        // Solved Count
        const stRes = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
        const stData = await stRes.json();
        if(stData.status==="OK"){
            const s = new Set();
            stData.result.forEach(x=>{if(x.verdict==="OK")s.add(x.problem.name)});
            document.getElementById("cfSolved").innerText = s.size;
        }
    } catch(e) { 
        console.error(e);
        document.getElementById("cfHandleLink").innerText = "API Error";
    } finally { 
        loader.style.display = "none"; 
    }
}

// Dark Mode Toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    document.getElementById('theme-toggle').innerText = document.body.classList.contains('light-mode') ? "☀️ Light Mode" : "🌙 Dark Mode";
});
