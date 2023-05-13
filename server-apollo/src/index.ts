// index.ts
import "reflect-metadata";
import { v4 as uuid } from "uuid";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import express, { Request, Response } from "express";
import session from "express-session";
import http from "http";
import cors from "cors";
import bodyParser from "body-parser";
import { mergeResolvers } from "@graphql-tools/merge";
import pm2 from "pm2";
import env from "./config/env.config";
import dataSource from "./config/database.config";
import sessionConfig from "./config/session.config";
import typeDefs from "./graphql/typeDefs";
import trackResolver from "./resolver/track.resolver";
import pm2Options from "./config/pm2.config";

type TContext = {
    token?: string;
};

const resolvers = mergeResolvers([trackResolver]);

const server = async () => {
    // Initialize TypeOrm database if configuration exists:
    if (env.DB_NAME) {
        dataSource
            .initialize()
            .then(async () => {
                console.log(`Database ${env.DB_NAME} initialized on port ${env.DB_PORT}.`);
            })
            .catch((error) => console.log(error));
    }

    // Initialize Express server as "app":
    const app = express();

    // httpServer handles incoming requests to the Express app:
    const httpServer = http.createServer(app);

    app.disable("x-powered-by");

    // Create an Express "session" to store user session data:
    app.use(session(sessionConfig));

    // Initialize Apollo Server:
    const apolloServer = new ApolloServer<TContext>({
        typeDefs,
        resolvers,
        /* context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
        }), */
        // Apollo Server should drain httpServer, allowing the server to shut down gracefully. */
        plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    });

    // Ensure we wait for our server to start
    await apolloServer.start();

    // Set up Express middleware with "app.use()":
    app.use(
        "/",
        // Middleware function that enables Cross-Origin Resource Sharing (CORS) support for "/" route:
        cors<cors.CorsRequest>(),
        // Middleware function that parses incoming request bodies in JSON format:
        bodyParser.json(),
        // Middleware function that integrates Apollo Server with Express:
        expressMiddleware(apolloServer, {
            context: async ({ req }) => ({ token: req.headers.token }),
        })
    );

    // Modified server startup as an asynchronous promise:
    await new Promise<void>((resolve) => httpServer.listen({ port: env.PORT }, resolve));
};

const initializeServer = () => {
    server()
        .then(() => {
            console.log(`🚀 Server running on http://localhost:${env.PORT}.`);
        })
        .catch((error) => {
            console.error(`Failed to start the server on ${env.PORT}:`, error);
        });
};

// Start the server with PM2
pm2.start(pm2Options, (error, _) => {
    if (error) {
        console.error("Failed to start the server with PM2:", error);
        process.exit(1); // Exit the process if PM2 fails to start
    }

    console.log(`Server starting with PM2...`);
    initializeServer();
});
