import { POST } from '../src/app/api/agent-chat/route';
import { NextRequest } from 'next/server';

async function test() {
  const req = new NextRequest('http://localhost:3000/api/agent-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-samjuniors-dev-as': 'founder',
      'x-samjuniors-dev-secret': 'samjuniors_dev_secret_local',
    },
    body: JSON.stringify({
      agentId: 'coo',
      message: 'What is your primary mandate as COO?',
    }),
  });

  try {
    const res = await POST(req);
    console.log('STATUS:', res.status);
    const data = await res.json();
    console.log('RESPONSE:', JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error('CAUGHT:', err);
  }
}

test();
