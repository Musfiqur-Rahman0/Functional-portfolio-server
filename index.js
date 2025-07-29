require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
var ImageKit = require("imagekit");
const paginate = require("./paginate");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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

app.get("/", (req, res) => {
  res.send("Portfolio server is ready");
});

const run = async () => {
  try {
    await client.connect();

    const db = client.db("projectsdb");
    const projectsCollection = db.collection("projects");
    const usersCollection = db.collection("users");

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
      const query = { _id: new ObjectId(id) };
      const result = await projectsCollection.findOne(query);
      res.send(result);
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

    app.post("/add-project", async (req, res) => {
      const newProject = req.body;
      const result = await projectsCollection.insertOne(newProject);
      res.send(result);
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
