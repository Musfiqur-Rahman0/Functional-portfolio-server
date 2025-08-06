const axios = require("axios");

const getGitHubStats = async (owner, repo) => {
  const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}`);
  return {
    stars: res.data.stargazers_count,
    forks: res.data.forks_count,
    lastUpdated: new Date(),
  };
};

module.exports = getGitHubStats;
