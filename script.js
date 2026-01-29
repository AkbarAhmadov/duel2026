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
    const displayHeaders = headers.filter(h => h !== 'Username' && h !== 'Solved Problems' && h !== 'CodeforcesHandle');

    let leaderboard = data.map(row => {
        let total = 0;
        let rounds = {};

        displayHeaders.forEach(round => {
            let score = Math.round(parseFloat(row[round])) || 0;
            rounds[round] = score;
            total += score;
        });

        return {
            username: row.Username || "Unknown",
            rounds: rounds,
            solvedProblems: parseInt(row['Solved Problems']) || 0,
            cfHandle: row['CodeforcesHandle'] || null,
            totalScore: total
        };
    });

    leaderboard.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return b.solvedProblems - a.solvedProblems;
    });

    return { displayHeaders, leaderboard };
}

function renderTable(headers, processedData) {
    const { displayHeaders, leaderboard } = processedData;
    const tableHead = document.querySelector('#leaderboard thead tr');
    const tableBody = document.getElementById('tableBody');

    tableHead.innerHTML = `<th>Rank</th><th>Username</th>`;
    displayHeaders.forEach(round => tableHead.innerHTML += `<th>${round}</th>`);
    tableHead.innerHTML += `<th>Solved (Tie-Break)</th><th>Total</th>`;

    tableBody.innerHTML = '';
    leaderboard.forEach((user, index) => {
        let roundCells = '';
        displayHeaders.forEach(round => {
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
    document.getElementById('leaderboardWrapper').style.display = 'block';
}

/* --- MODAL & API LOGIC --- */
const modal = document.getElementById("userModal");
const closeBtn = document.querySelector(".close-btn");

closeBtn.onclick = function() { modal.style.display = "none"; }
window.onclick = function(event) { if (event.target == modal) modal.style.display = "none"; }

function openModal(username, cfHandle) {
    modal.style.display = "block";
    document.getElementById("modalUsername").innerText = username;
    
    // Elementleri sıfırla
    const handleLink = document.getElementById("cfHandleLink");
    handleLink.innerText = cfHandle || "Not linked";
    handleLink.href = "#"; // Varsayılan olarak boş
    
    document.getElementById("cfRating").innerText = "-";
    document.getElementById("cfMaxRating").innerText = "-";
    document.getElementById("cfRank").innerText = "-";
    document.getElementById("cfSolved").innerText = "-";
    document.getElementById("cfRating").style.color = "var(--text-main)"; // Rengi sıfırla

    if (cfHandle && cfHandle.trim() !== "") {
        fetchCodeforcesStats(cfHandle.trim());
    } else {
        handleLink.innerText = "No Codeforces Account";
        // Tıklanabilirliği kaldır
        handleLink.removeAttribute("href");
    }
}

async function fetchCodeforcesStats(handle) {
    const loader = document.getElementById("modalLoader");
    loader.style.display = "block";

    try {
        // 1. Kullanıcı Bilgileri
        const infoResponse = await fetch(`https://codeforces.com/api/user.info?handles=${handle}`);
        const infoData = await infoResponse.json();

        if (infoData.status === "OK") {
            const user = infoData.result[0];
            
            // Linki Güncelle
            const handleLink = document.getElementById("cfHandleLink");
            handleLink.href = `https://codeforces.com/profile/${handle}`;
            
            // Rating ve Rank
            const ratingElem = document.getElementById("cfRating");
            const maxRatingElem = document.getElementById("cfMaxRating");
            
            ratingElem.innerText = user.rating || "Unrated";
            maxRatingElem.innerText = user.maxRating || "Unrated";
            document.getElementById("cfRank").innerText = user.rank || "Unrated"; // Rank (Örn: Specialist)

            // Rating Rengi Ayarlama
            if (user.rating) {
                if(user.rating >= 2400) ratingElem.style.color = "#FF0000"; // Red
                else if(user.rating >= 2100) ratingElem.style.color = "#FF8C00"; // Orange
                else if(user.rating >= 1900) ratingElem.style.color = "#AA00AA"; // Violet
                else if(user.rating >= 1600) ratingElem.style.color = "#0000FF"; // Blue
                else if(user.rating >= 1400) ratingElem.style.color = "#03A89E"; // Cyan
                else if(user.rating >= 1200) ratingElem.style.color = "#008000"; // Green
                else ratingElem.style.color = "#808080"; // Gray
            }
        }

        // 2. Çözülen Problemler
        const statusResponse = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
        const statusData = await statusResponse.json();

        if (statusData.status === "OK") {
            const submissions = statusData.result;
            const solvedSet = new Set();
            submissions.forEach(sub => {
                if (sub.verdict === "OK") {
                    solvedSet.add(sub.problem.name); 
                }
            });
            document.getElementById("cfSolved").innerText = solvedSet.size;
        }

    } catch (error) {
        console.error("CF API Error:", error);
        document.getElementById("cfHandleLink").innerText = "Error fetching data";
    } finally {
        loader.style.display = "none";
    }
}

// Dark Mode Toggle
const themeBtn = document.getElementById('theme-toggle');
themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    themeBtn.innerText = document.body.classList.contains('light-mode') ? "☀️ Light Mode" : "🌙 Dark Mode";
});
