const axios = require("axios");
const getDownloads = async (packageName) => {
  try {
    const [monthly, daily] = await Promise.all([
      axios.get(
        `https://api.npmjs.org/downloads/point/last-month/${packageName}`
      ),
      axios.get(
        `https://api.npmjs.org/downloads/point/last-day/${packageName}`
      ),
    ]);
    return {
      monthly: monthly.data.downloads,
      daily: daily.data.downloads,
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.log(error);
  }
};

module.exports = getDownloads;
