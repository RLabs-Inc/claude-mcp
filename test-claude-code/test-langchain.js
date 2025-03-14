// Test file for Claude Code to demonstrate usage of LangChain.js documentation
// We want to create a simple LangChain.js application that:
// 1. Creates a ChatOpenAI instance
// 2. Uses the RetrievalQAChain to answer questions based on documents
// 3. Shows how to define embedding models and vector stores
// 4. Demonstrates prompt templates
// 5. Uses the latest APIs from LangChain.js version 0.3.19

// The goal is to see if Claude uses the latest LangChain.js documentation
// to implement these features correctly with the current API patterns.

// Please implement this application using LangChain.js 0.3.19

import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";

async function main() {
  // 1. Create a ChatOpenAI instance
  const model = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0.2,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  // 2. Load and prepare documents
  const loader = new PDFLoader("./documents/sample.pdf");
  const docs = await loader.load();
  
  // Split documents into smaller chunks
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const splitDocs = await textSplitter.splitDocuments(docs);
  
  // 3. Create embedding model and vector store
  const embeddings = new OpenAIEmbeddings();
  const vectorStore = await MemoryVectorStore.fromDocuments(
    splitDocs,
    embeddings
  );
  
  // Create a retriever from the vector store
  const retriever = vectorStore.asRetriever({
    k: 3, // Number of documents to retrieve
  });
  
  // 4. Create prompt template
  const promptTemplate = ChatPromptTemplate.fromTemplate(`
    Answer the question based only on the following context:
    {context}
    
    Question: {question}
    
    If you don't know the answer, just say you don't know. Don't try to make up an answer.
  `);
  
  // Create a chain that combines documents
  const documentChain = await createStuffDocumentsChain({
    llm: model,
    prompt: promptTemplate,
  });
  
  // 5. Create the retrieval QA chain
  const retrievalChain = await createRetrievalChain({
    retriever,
    combineDocsChain: documentChain,
  });
  
  // Run the chain with a sample question
  const result = await retrievalChain.invoke({
    question: "What are the key points in this document?",
  });
  
  console.log("Question: What are the key points in this document?");
  console.log("Answer:", result.answer);
}

main().catch(console.error);