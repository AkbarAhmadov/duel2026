const CSV_FILE = 'veriler.csv';

// Global Variables
let currentLeaderboardData = [];
let currentHeaders = [];
let globalRoundHeaders = [];

window.onload = function() {
    fetch(CSV_FILE)
        .then(res => {
            if (!res.ok) throw new Error("CSV file not found!");
            return res.text();
        })
        .then(csvText => {
            const { headers, data } = parseCSV(csvText);
            const processed = processLeaderboard(headers, data);
            
            // Verileri sakla
            currentHeaders = processed.displayHeaders;
            globalRoundHeaders = processed.roundHeaders;
            currentLeaderboardData = processed.leaderboard;
            
            // 1. Tabloyu Çiz
            renderTable();
            
            // 2. Duelleri Hesapla ve Çiz
            renderDuels(processed.roundHeaders, data);
        })
        .catch(err => {
            document.getElementById('loading').innerText = "Error: " + err.message;
            document.getElementById('loading').style.color = "var(--loser)";
        });
};

/* --- CSV PARSING --- */
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim());
    
    const data = lines.slice(1).map(line => {
        // Satırı böl ama boş satırları atla
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

/* --- DATA PROCESSING --- */
function processLeaderboard(headers, data) {
    // Sütunları ayır
    const roundHeaders = headers.filter(h => h.toLowerCase().includes('round'));
    // Görüntülenecek sütunlar (Username, Solved vs. hariç)
    const displayHeaders = headers.filter(h => 
        h !== 'Username' && 
        h !== 'Solved Problems' && 
        h !== 'CodeforcesHandle' && 
        h !== 'R1_Opponent'
    );

    let leaderboard = data.map(row => {
        let total = 0;
        let rounds = {};

        // Round puanlarını işle (Round 1, Round 2...)
        roundHeaders.forEach(round => {
            // Integer'a yuvarla
            let score = Math.round(parseFloat(row[round])) || 0;
            rounds[round] = score;
            // Sadece 'Total' sütununa dahil olacak roundları topla
            // displayHeaders içinde varsa toplama dahil et (opsiyonel kontrol)
            if (displayHeaders.includes(round)) {
                total += score;
            }
        });

        return {
            username: row.Username || "Unknown",
            rounds: rounds,
            solvedProblems: parseInt(row['Solved Problems']) || 0,
            cfHandle: row['CodeforcesHandle'] || null,
            r1Opponent: row['R1_Opponent'] || null,
            totalScore: total
        };
    });

    // Varsayılan Sıralama: Toplam Puan -> Çözülen Sayısı
    leaderboard.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return b.solvedProblems - a.solvedProblems;
    });

    return { displayHeaders, leaderboard, roundHeaders };
}

/* --- DUEL / MATCHMAKING LOGIC --- */
function renderDuels(roundHeaders, rawData) {
    const duelsWrapper = document.getElementById('duelsWrapper');
    duelsWrapper.innerHTML = '';

    // Ham veriyi işle (Hesaplama için)
    let players = rawData.map(row => {
        let p = { username: row.Username, rounds: {}, totalUntilNow: 0 };
        roundHeaders.forEach(r => {
            p.rounds[r] = Math.round(parseFloat(row[r])) || 0;
        });
        p.r1Opponent = row.R1_Opponent;
        return p;
    });

    roundHeaders.forEach((roundName, roundIndex) => {
        let matchesHTML = '';
        let pairedUsers = new Set(); 

        // --- ROUND 1: Excel'deki Rakiplere Göre ---
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
        
        // --- ROUND 2+: Önceki Turların Toplamına Göre (Swiss System) ---
        else {
            // Her oyuncu için o ana kadarki (bu round hariç) toplamı hesapla
            players.forEach(p => {
                let currentTotal = 0;
                for (let i = 0; i < roundIndex; i++) {
                    currentTotal += p.rounds[roundHeaders[i]];
                }
                p.totalUntilNow = currentTotal;
            });

            // Puana göre sırala (Çoktan aza)
            // Eğer puan eşitse isme göre sırala (rastgelelik olmaması için)
            let sortedPlayers = [...players].sort((a, b) => {
                if (b.totalUntilNow !== a.totalUntilNow) return b.totalUntilNow - a.totalUntilNow;
                return a.username.localeCompare(b.username);
            });

            // 1 vs 2, 3 vs 4 Eşleştir
            for (let i = 0; i < sortedPlayers.length; i += 2) {
                if (i + 1 < sortedPlayers.length) {
                    let p1 = sortedPlayers[i];
                    let p2 = sortedPlayers[i+1];
                    matchesHTML += createMatchHTML(p1, p2, roundName);
                }
            }
        }

        // Accordion Ekle
        const accordionHTML = `
            <div class="accordion-item">
                <div class="accordion-header" onclick="toggleAccordion(this)">
                    ${roundName} <span>▼</span>
                </div>
                <div class="accordion-content">
                    ${matchesHTML || '<p style="text-align:center; color:gray; font-size:0.9rem;">Waiting for pairings...</p>'}
                </div>
            </div>
        `;
        duelsWrapper.innerHTML += accordionHTML;
    });
}

function createMatchHTML(p1, p2, roundName) {
    let s1 = p1.rounds[roundName];
    let s2 = p2.rounds[roundName];
    
    // Varsayılan: P1 Solda, P2 Sağda
    let leftUser = p1;
    let rightUser = p2;
    let leftScore = s1;
    let rightScore = s2;

    // Kural: Kazanan her zaman SOL tarafta olsun.
    // Eğer P2 kazandıysa yer değiştir.
    if (s2 > s1) {
        leftUser = p2; leftScore = s2;
        rightUser = p1; rightScore = s1;
    }

    let leftClass = "winner-text";
    let rightClass = "loser-text";

    // Beraberlik durumu (Nadir ama olsun)
    if (s1 === s2) {
        leftClass = "";
        rightClass = "";
    }

    return `
        <div class="duel-match">
            <div class="player-side player-left">
                <span class="score-badge ${leftClass}">${leftScore}</span>
                <span class="${leftClass}">${leftUser.username}</span>
            </div>
            <div class="vs-badge">vs</div>
            <div class="player-side player-right">
                <span class="${rightClass}">${rightUser.username}</span>
                <span class="score-badge ${rightClass}">${rightScore}</span>
            </div>
        </div>
    `;
}

function toggleAccordion(header) {
    const content = header.nextElementSibling;
    const isActive = content.classList.contains('active');
    
    // Açık olan diğerlerini kapat (İstersen bu satırı silip çoklu açmayı aktif edebilirsin)
    document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));

    if (!isActive) {
        content.classList.add('active');
    }
}

/* --- SORTING & RENDERING TABLE --- */
function sortData(criteria) {
    currentLeaderboardData.sort((a, b) => {
        let valA, valB;
        if (criteria === 'totalScore') {
            valA = a.totalScore; valB = b.totalScore;
        } else if (criteria === 'solvedProblems') {
            valA = a.solvedProblems; valB = b.solvedProblems;
        } else {
            // Round
            valA = a.rounds[criteria] || 0;
            valB = b.rounds[criteria] || 0;
        }

        if (valB !== valA) return valB - valA;
        return b.totalScore - a.totalScore; // Tie-break
    });
    renderTable();
}

function renderTable() {
    const tableHead = document.querySelector('#leaderboard thead tr');
    const tableBody = document.getElementById('tableBody');

    // Başlıklar
    let headerHTML = `<th>Rank</th><th>Username</th>`;
    currentHeaders.forEach(round => {
        headerHTML += `<th class="sortable" onclick="sortData('${round}')">${round}</th>`;
    });
    headerHTML += `<th class="sortable" onclick="sortData('solvedProblems')">Solved (Tie-Break)</th>`;
    headerHTML += `<th class="sortable" onclick="sortData('totalScore')">Total</th>`;
    
    tableHead.innerHTML = headerHTML;

    // Satırlar
    tableBody.innerHTML = '';
    currentLeaderboardData.forEach((user, index) => {
        let roundCells = '';
        currentHeaders.forEach(round => {
            roundCells += `<td>${user.rounds[round]}</td>`;
        });

        const rowHTML = `
            <tr onclick="openModal('${user.username}', '${user.cfHandle}')">
                <td>${index + 1}</td>
                <td class="user-name-cell">${user.username}</td>
                ${roundCells}
                <td class="solved-cell">${user.solvedProblems}</td>
                <td class="total-cell">${user.totalScore}</td>
            </tr>
        `;
        tableBody.innerHTML += rowHTML;
    });

    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'flex'; // Layout'u göster
}

/* --- MODAL & API --- */
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
    handleLink.href = "#";
    handleLink.removeAttribute("href");
    document.getElementById("cfRating").innerText = "-";
    document.getElementById("cfMaxRating").innerText = "-";
    document.getElementById("cfRank").innerText = "-";
    document.getElementById("cfSolved").innerText = "-";
    document.getElementById("cfRating").style.color = "var(--text-main)";

    if (cfHandle && cfHandle.trim() !== "") {
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
            const handleLink = document.getElementById("cfHandleLink");
            handleLink.href = `https://codeforces.com/profile/${handle}`;
            
            const ratingElem = document.getElementById("cfRating");
            ratingElem.innerText = user.rating || "Unrated";
            document.getElementById("cfMaxRating").innerText = user.maxRating || "Unrated";
            document.getElementById("cfRank").innerText = user.rank || "Unrated";

            // Rating Color
            if (user.rating) {
                if(user.rating >= 2400) ratingElem.style.color = "#FF0000"; // GM+
                else if(user.rating >= 2100) ratingElem.style.color = "#FF8C00"; // Master
                else if(user.rating >= 1900) ratingElem.style.color = "#AA00AA"; // CM
                else if(user.rating >= 1600) ratingElem.style.color = "#0000FF"; // Expert
                else if(user.rating >= 1400) ratingElem.style.color = "#03A89E"; // Specialist
                else if(user.rating >= 1200) ratingElem.style.color = "#008000"; // Pupil
                else ratingElem.style.color = "#808080"; 
            }
        }

        // Solved Count
        const statusRes = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
        const statusData = await statusRes.json();

        if (statusData.status === "OK") {
            const solvedSet = new Set();
            statusData.result.forEach(sub => {
                if (sub.verdict === "OK") solvedSet.add(sub.problem.name);
            });
            document.getElementById("cfSolved").innerText = solvedSet.size;
        }

    } catch (error) {
        console.error("API Error", error);
        document.getElementById("cfHandleLink").innerText = "Error fetching data";
    } finally {
        loader.style.display = "none";
    }
}

// Dark Mode Toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const btn = document.getElementById('theme-toggle');
    btn.innerText = document.body.classList.contains('light-mode') ? "☀️ Light Mode" : "🌙 Dark Mode";
});
