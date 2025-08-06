require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
var ImageKit = require("imagekit");
const paginate = require("./paginate");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const getGitHubStats = require("./utils/getGitstars");
const getDownloads = require("./utils/getDownloads");

const app = express();
// middleware
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_API_KEY;

// console.log(process.env.DB_PASS, process.env.DB_USER);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nliquld.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

var imagekit = new ImageKit({
  publicKey: process.env.VITE_IMGKIT_PK,
  privateKey: process.env.VITE_IMGKIT_SK,
  urlEndpoint: process.env.VITE_IMGKIT_ENDPOINT,
});

const skills = [
  {
    pkg: "react",
    repo: "facebook",
    profeciency: 80,
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
    description: "A JavaScript library for building user interfaces.",
  },
  {
    pkg: "vue",
    repo: "vuejs",
    profeciency: 30,
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg",
    description: "A progressive framework for building user interfaces.",
  },
  {
    pkg: "tailwindcss",
    repo: "tailwindlabs",
    profeciency: 70,
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tailwindcss/tailwindcss-plain.svg",
    description: "A utility-first CSS framework for rapid UI development.",
  },
];

app.get("/", (req, res) => {
  res.send("Portfolio server is ready");
});

const run = async () => {
  try {
    await client.connect();

    const db = client.db("projectsdb");
    const projectsCollection = db.collection("projects");
    const usersCollection = db.collection("users");
    const skillsCollection = db.collection("skills");
    const reviewsCollection = db.collection("reviews");

    app.get("/projects", async (req, res) => {
      try {
        const { category, page, limit } = req.query;

        let query = {};

        if (category && category !== "all") {
          if (typeof category !== "string") {
            return res.status(400).json({ message: "Invalid category type" });
          }
          query.category = { $regex: category, $options: "i" };
        }

        const result = await paginate(projectsCollection, query, {
          page,
          limit,
        });
        res.send(result);
      } catch (err) {
        console.error("Error in /projects:", err);
        res.status(500).json({ message: "Server Error" });
      }
    });

    app.get("/project/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid ID format" });
      }
      const query = { _id: new ObjectId(id) };
      const result = await projectsCollection.findOne(query);
      res.send(result);
    });

    app.get("/skills", async (req, res) => {
      try {
        const { name } = req.query;

        if (name) {
          const query = { "Package Name": { $regex: name, $options: "i" } };
          const skill = await skillsCollection.findOne(query);

          if (!skill) {
            return res.status(404).send({ message: "Skill not found" });
          }

          return res.status(200).send(skill);
        }

        const skills = await skillsCollection.find().toArray();
        return res.status(200).send(skills);
      } catch (error) {
        console.error("Error fetching skills:", error);
        return res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.post("/skills", async (req, res) => {
      try {
        const now = new Date().toISOString();
        const skill = req.body;

        const query = {
          "Package Name": skill["Package Name"],
        };

        const matched = await skillsCollection.findOne(query);
        if (matched) {
          return res
            .status(409) // 409 Conflict
            .send({ message: "Skill with this package name already exists" });
        }

        skill.added_on = now;
        skill.updated_on = now;
        const result = await skillsCollection.insertOne(skill);
        res.status(201).send({ message: "New skill added ", result });
      } catch (error) {
        res.status(500).send({ message: "something not correct" });
      }
    });

    app.get("/skills-stats", async (req, res) => {
      try {
        const skills = await skillsCollection.find().toArray();
        const now = new Date();

        const updateSkills = await Promise.all(
          skills.map(async (pkg) => {
            if (!pkg || !pkg["Repo Name"] || !pkg["Package Name"]) {
              return pkg;
            }

            // Downloads check
            const downloadsAge = pkg?.downloads?.lastUpdated
              ? (now - new Date(pkg.downloads.lastUpdated)) / (1000 * 60 * 60)
              : Infinity;

            if (downloadsAge > 24) {
              const newDownloads = await getDownloads(pkg["Repo Name"]);
              await skillsCollection.updateOne(
                { "Package Name": pkg["Package Name"] },
                { $set: { downloads: newDownloads } }
              );
              pkg.downloads = newDownloads;
            }

            // GitHub check
            if (!pkg["Repo Owner"]) {
              return pkg;
            }

            const githubAge = pkg?.github?.lastUpdated
              ? (now - new Date(pkg.github.lastUpdated)) / (1000 * 60 * 60)
              : Infinity;

            if (githubAge > 24) {
              const newGithub = await getGitHubStats(
                pkg["Repo Owner"],
                pkg["Repo Name"]
              );
              await skillsCollection.updateOne(
                { "Package Name": pkg["Package Name"] },
                { $set: { github: newGithub } }
              );
              pkg.github = newGithub;
            }
            return pkg;
          })
        );

        res.send(updateSkills);
      } catch (err) {
        // console.error("Error in /skills-stats:", err);
        return res.status(400).json({ error: "Something went wrong." });
      }
    });

    app.get("/reviews", async (req, res) => {
      try {
        const { search } = req.query;
        const query = {};
        const result = await reviewsCollection
          .find(query)
          .sort({
            posted_on: -1,
          })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "something bad is going on ", error });
      }
    });

    app.post("/reviews", async (req, res) => {
      try {
        const new_review = req.body;
        const result = await reviewsCollection.insertOne(new_review);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "error ", error });
      }
    });

    app.delete("/reviews/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await reviewsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "some error ---", error });
      }
    });

    app.delete("/project/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await projectsCollection.deleteOne(query);
      res.send(result);
    });

    app.put("/project/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const updatedProject = req.body;
      const updateDoc = {
        $set: updatedProject,
      };
      const result = await projectsCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.patch("/project/comment/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const updatedProject = req.body;
        updatedProject._id = new ObjectId();
        const updateDoc = {
          $push: { comments: updatedProject },
        };
        const result = await projectsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "somthing errror", error });
      }
    });

    app.patch("/project/:projectId/comments/:commentId", async (req, res) => {
      try {
        const { projectId, commentId } = req.params;

        const query = {
          _id: new ObjectId(projectId),
          "comments._id": new ObjectId(commentId),
        };

        const updateDoc = {
          $pull: {
            comments: {
              _id: new ObjectId(commentId),
            },
          },
        };

        const result = await projectsCollection.updateOne(query, updateDoc);
        if (result.modifiedCount === 0) {
          return res
            .status(403)
            .send({ message: "Unauthorized or comment not found" });
        }
        res.send({
          status: "success",
          message: "Comment deleted successfully",
        });
      } catch (error) {
        res.status(500).send({ message: "errro", error });
      }
    });

    app.post("/add-project", async (req, res) => {
      const newProject = req.body;
      const result = await projectsCollection.insertOne(newProject);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const { email, name, role, page, limit } = req.query;
      const query = {};
      const option = { sort: { created_at: -1 } };

      if (email) {
        query.email = { $regex: email, $options: "i" };
      }
      if (name) {
        query.name = { $regex: name, $options: "i" };
      }
      if (role) {
        query.role = { $regex: role, $options: "i" };
      }

      if (email && !name && !role && !page && !limit) {
        const user = await usersCollection.findOne(query);
        return res.send(user);
      }

      if (page && limit) {
        const pageInNumber = Number(page);
        const limitInNumber = Number(limit);
        const skip = (pageInNumber - 1) * limitInNumber;

        const usersWithPages = await usersCollection
          .find(query, option)
          .skip(skip)
          .limit(limitInNumber)
          .toArray();

        const totalUsers = await usersCollection.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limitInNumber);

        return res.send({ users: usersWithPages, totalPages, totalUsers });
      }

      const users = await usersCollection.find(query, option).toArray();
      return res.send({ users });
    });

    // post new users to the database
    app.post("/users", async (req, res) => {
      try {
        const newUser = req.body;

        if (!newUser || !newUser.email) {
          return res.status(400).send({ message: "Invalid user data" });
        }

        const { email } = newUser;
        const query = { email };

        // checking if the users already exits.
        const matchedUser = await usersCollection.findOne(query);
        const last_log_in = new Date().toISOString();

        // if users matched then updating the last log in time of the users
        if (matchedUser) {
          await usersCollection.updateOne(query, { $set: { last_log_in } });
          return res
            .status(200)
            .send({ message: "users already exits in the db", matchedUser });
        }

        // adding role to the user default as user
        newUser.role = "user";
        newUser.created_at = new Date().toISOString();

        const result = await usersCollection.insertOne(newUser);

        return res.status(201).send({
          message: "User created successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        return res
          .status(500)
          .send({ message: "faild to add new user", error });
      }
    });

    app.get("/categories", async (req, res) => {
      const filter = {
        projection: {
          category: 1,
          _id: 1,
        },
      };
      const categories = await projectsCollection.find({}, filter).toArray();
      const uniqueCategories = [
        ...new Set(categories.map((category) => category.category)),
      ];

      res.send(uniqueCategories);
    });

    app.get("/signature", async (req, res) => {
      try {
        const expire = Math.floor(Date.now() / 1000) + 300; // expire 5 minutes from now
        const token = crypto.randomBytes(16).toString("hex"); // generate a secure token
        const dataToSign = `expire=${expire}&token=${token}${PRIVATE_KEY}`;

        const signature = crypto
          .createHash("sha1")
          .update(dataToSign)
          .digest("hex");
        res.send({
          signature,
          expire,
          token,
        });
      } catch (error) {
        res.status(500).send({ message: "missing something" });
      }
    });

    app.get("/api/imagekit-auth", (req, res) => {
      try {
        const authParams = imagekit.getAuthenticationParameters();
        res.send(authParams);
      } catch (error) {
        res.status(500).json({ error: "Failed to get auth parameters" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged successfull");
  } finally {
  }
};

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Porfolio server is runing on port ${port}`);
});
