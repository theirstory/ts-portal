'use server';
import { Chunks } from '@/types/weaviate';
import { initWeaviateClient } from './client';

export async function askQuestion(question: string, limit = 5) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');

  const response = await myCollection.generate.nearText(
    question,
    {
      groupedTask: `You are an expert archivist and researcher analyzing recorded interviews and oral histories. Based on the provided interview transcripts and recordings, please answer the following question: "${question}"

Please provide a comprehensive and informative response that:
1. Directly addresses the question using specific information from the interviews
2. Includes relevant quotes and context from the speakers
3. Uses an academic yet accessible tone appropriate for researchers and students
4. Cites specific interviews or speakers when possible
5. If the question cannot be fully answered from the available materials, acknowledge the limitations

Your response should be well-structured with clear paragraphs and should synthesize information from multiple sources when relevant. Use numbered citations [1], [2], etc. to reference specific interviews or speakers mentioned in your response.`,
    },
    {
      targetVector: 'transcription_vector',
      limit: limit,
      returnMetadata: ['distance', 'score', 'certainty'],
    },
  );

  return response;
}
