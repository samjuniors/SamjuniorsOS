import { CommunicationRuntime, mapIntentToSideEffectClassification } from '../lib/server/communication/runtime';
import { InMemoryCommunicationStore } from '../lib/server/communication/store';
import { CommunicationProviderRegistry, CommunicationProviderAdapter } from '../lib/server/communication/provider';
import { SideEffectAuthorizationGate } from '../lib/server/authorization/gate';
import { InMemoryApprovalStore, InMemoryAuditStore } from '../lib/server/authorization/approval-store';
import { WorkflowRuntime } from '../lib/server/workflow/runtime';
import { WorkflowScheduler } from '../lib/server/workflow/scheduler';
import { InMemoryWorkflowStore } from '../lib/server/workflow/store';
import { InMemoryScheduledWorkStore } from '../lib/server/workflow/scheduler-store';
import { WorkflowDefinition } from '../types/workflow';
import { Contact, Conversation, Message, Draft, DeliveryStatus, MessageFilter, MessageThread } from '../types/communication';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runPhase12_4Tests() {
  console.log('=== Running Phase 12.4: Communication Infrastructure Foundation Tests ===');

  // Reset all stores
  const commStore = InMemoryCommunicationStore.getInstance();
  const commRuntime = CommunicationRuntime.getInstance();
  const providerRegistry = CommunicationProviderRegistry.getInstance();
  const approvalStore = InMemoryApprovalStore.getInstance();
  const auditStore = InMemoryAuditStore.getInstance();
  const workflowStore = InMemoryWorkflowStore.getInstance();
  const schedulerStore = InMemoryScheduledWorkStore.getInstance();
  const gate = SideEffectAuthorizationGate.getInstance();

  commStore.clear();
  approvalStore.clear();
  auditStore.clear();
  workflowStore.clear();
  schedulerStore.clear();
  providerRegistry.resetToDefaults();

  // ==========================================
  // TEST GROUP 1: Contact Model & Provenance
  // ==========================================
  console.log('\n--- Test Group 1: Contact Model & Provenance ---');

  const contact1 = await commRuntime.createContact({
    name: 'Sarah Chen',
    email: 'sarah.chen@innovatecorp.example',
    organizationName: 'InnovateCorp',
    role: 'VP of Engineering',
    verificationState: 'verified',
    sourceProvenance: {
      sourceSystem: 'company_state',
      sourceId: 'crm-deal-001',
      sourceTitle: 'InnovateCorp Enterprise Pilot',
      epistemicType: 'current_truth',
    },
    requestedBy: 'pm',
  });

  assert(contact1.id.startsWith('contact-'), 'Contact ID generated correctly');
  assert(contact1.name === 'Sarah Chen' && contact1.email === 'sarah.chen@innovatecorp.example', 'Contact name and email preserved');
  assert(contact1.verificationState === 'verified', 'Verification state is verified');
  assert(contact1.sourceProvenance?.sourceTitle === 'InnovateCorp Enterprise Pilot', 'Source provenance preserved');

  // Lookup by email
  const foundByEmail = await commRuntime.findContactByEmail('sarah.chen@innovatecorp.example');
  assert(foundByEmail !== null && foundByEmail.id === contact1.id, 'Find contact by email succeeds');

  // Search contacts
  const searched = await commRuntime.listContacts({ query: 'innovate' });
  assert(searched.length === 1 && searched[0].name === 'Sarah Chen', 'Search contacts by organization query succeeds');

  // Advisor role cannot create contacts (internal mutation denied)
  let advisorBlocked = false;
  try {
    await commRuntime.createContact({
      name: 'Advisory Contact',
      email: 'advisory@test.com',
      requestedBy: 'advisor' as any,
    });
  } catch (err: any) {
    advisorBlocked = true;
  }
  assert(advisorBlocked, 'Advisor role strictly prohibited from registering contacts');

  // ==========================================
  // TEST GROUP 2: Conversation & Message Threading
  // ==========================================
  console.log('\n--- Test Group 2: Conversation & Message Threading ---');

  const conv = await commRuntime.createConversation({
    channel: 'email',
    subject: 'Partnership Evaluation: Q3 Objectives',
    participants: [
      { address: 'coo@company.internal', name: 'Alex Rivera', role: 'coo' },
      { contactId: contact1.id, address: contact1.email, name: contact1.name, role: 'VP of Engineering' },
    ],
    relatedEntityRef: {
      entityType: 'customer',
      entityId: 'cust-innovatecorp',
      entityName: 'InnovateCorp',
    },
    workflowRef: {
      workflowId: 'wf-outreach-1',
      workflowInstanceId: 'inst-comm-1',
      stepId: 'step-initiate-conv',
    },
    requestedBy: 'coo',
  });

  assert(conv.id.startsWith('conv-'), 'Conversation ID generated correctly');
  assert(conv.participants.length === 2, 'Conversation participants registered');
  assert(conv.status === 'active', 'Conversation initialized as active');
  assert(conv.workflowRef?.workflowInstanceId === 'inst-comm-1', 'Workflow provenance attached to conversation');

  // ==========================================
  // TEST GROUP 3: Drafts Lifecycle
  // ==========================================
  console.log('\n--- Test Group 3: Drafts Lifecycle ---');

  const draft1 = await commRuntime.createDraft({
    conversationId: conv.id,
    authoringRole: 'pm',
    channel: 'email',
    intendedRecipients: [{ address: 'sarah.chen@innovatecorp.example', name: 'Sarah Chen' }],
    subject: 'Follow up regarding API integration specs',
    bodyContent: 'Hi Sarah,\n\nFollowing up on our architecture review. Attached are the spec highlights.\n\nBest,\nMaya',
    workflowRef: {
      workflowId: 'wf-outreach-1',
      workflowInstanceId: 'inst-comm-1',
      stepId: 'step-draft-spec',
    },
  });

  assert(draft1.id.startsWith('draft-'), 'Draft ID generated correctly');
  assert(draft1.status === 'draft', 'Draft initialized strictly in draft status');
  assert(draft1.authoringRole === 'pm', 'Authoring role registered as PM');

  // Update draft
  const updatedDraft = await commRuntime.updateDraft(
    draft1.id,
    { bodyContent: 'Updated body content with finalized security guidelines.' },
    'pm'
  );
  assert(updatedDraft?.bodyContent.includes('finalized security guidelines') === true, 'Draft updated successfully');

  // List drafts
  const pmDrafts = await commRuntime.listDrafts({ authoringRole: 'pm' });
  assert(pmDrafts.length === 1 && pmDrafts[0].id === draft1.id, 'PM drafts listed correctly');

  // ==========================================
  // TEST GROUP 4: Intent Classification & Authorization Mapping
  // ==========================================
  console.log('\n--- Test Group 4: Intent Classification & Authorization Mapping ---');

  assert(mapIntentToSideEffectClassification('read') === 'read_only', 'read maps to read_only');
  assert(mapIntentToSideEffectClassification('search') === 'read_only', 'search maps to read_only');
  assert(mapIntentToSideEffectClassification('classify') === 'read_only', 'classify maps to read_only');
  assert(mapIntentToSideEffectClassification('draft') === 'internal_mutation', 'draft maps to internal_mutation');
  assert(mapIntentToSideEffectClassification('schedule') === 'internal_mutation', 'schedule maps to internal_mutation');
  assert(mapIntentToSideEffectClassification('send') === 'external_communication', 'send maps to external_communication');
  assert(mapIntentToSideEffectClassification('reply') === 'external_communication', 'reply maps to external_communication');

  // 1. Read Intent Execution
  const readResult = await commRuntime.executeIntent({
    type: 'read',
    employeeRole: 'researcher',
    channel: 'email',
    payload: { filter: { conversationId: conv.id } },
  });
  assert(readResult.allowed === true && readResult.decision.effect === 'allowed', 'Read intent allowed autonomously');

  // 2. Draft Intent Execution via executeIntent
  const draftIntentResult = await commRuntime.executeIntent({
    type: 'draft',
    employeeRole: 'coo',
    channel: 'email',
    payload: {
      conversationId: conv.id,
      intendedRecipients: [{ address: 'sarah.chen@innovatecorp.example' }],
      subject: 'Executive Briefing',
      bodyContent: 'Executive summary content',
    },
  });
  assert(draftIntentResult.allowed === true && draftIntentResult.result.status === 'draft', 'Draft intent creates draft safely');

  // 3. Unapproved Send Intent Execution (Blocked by Gate)
  const unapprovedSend = await commRuntime.executeIntent({
    type: 'send',
    employeeRole: 'coo',
    channel: 'email',
    payload: {
      conversationId: conv.id,
      to: 'sarah.chen@innovatecorp.example',
      subject: 'Direct Blast without Approval',
      bodyContent: 'Should not go out',
    },
  });
  assert(unapprovedSend.allowed === false, 'Unapproved send intent is strictly blocked by authorization gate');
  assert(unapprovedSend.decision.reasonCode === 'APPROVAL_REQUIRED_EXTERNAL_COMMUNICATION', 'Reason code requires Founder approval');

  // ==========================================
  // TEST GROUP 5: Provider Adapter Boundary & Safe Execution
  // ==========================================
  console.log('\n--- Test Group 5: Provider Adapter Boundary & Safe Execution ---');

  // 1. Request and obtain Founder approval for sending draft1 with cryptographic payload binding
  const draft1Payload = {
    draftId: draft1.id,
    conversationId: draft1.conversationId,
    threadId: draft1.threadId,
    sender: {
      address: 'pm@company.internal',
      name: 'PM',
    },
    recipients: draft1.intendedRecipients,
    cc: draft1.cc,
    bcc: draft1.bcc,
    subject: draft1.subject,
    bodyContent: draft1.bodyContent,
    bodyMimeType: draft1.bodyMimeType,
  };

  const draft1Target = {
    targetSystem: 'email',
    recipient: 'sarah.chen@innovatecorp.example',
    summary: 'Send finalized security and integration specs',
  };

  const sendAppr = await gate.requestApproval({
    actionName: 'Send Integration Spec Email',
    classification: 'external_communication',
    workflowInstanceId: 'inst-comm-1',
    stepId: 'step-send-spec',
    employeeRole: 'pm',
    scope: { scopeType: 'step', workflowInstanceId: 'inst-comm-1', stepId: 'step-send-spec' },
    target: draft1Target,
    payload: draft1Payload,
  });

  await gate.decideApproval({
    approvalId: sendAppr.id,
    decision: 'approved',
    decidedBy: 'founder',
  });

  // 2. Execute send with Null Provider Adapter (Default unconfigured state)
  // Gate allows execution, but system reports honest delivery status ('failed' / 'NO_EXTERNAL_PROVIDER_CONFIGURED')
  const sendResultNull = await commRuntime.sendDraft({
    draftId: draft1.id,
    approvalId: sendAppr.id,
    requestedBy: 'pm',
    workflowRef: {
      workflowId: 'wf-outreach-1',
      workflowInstanceId: 'inst-comm-1',
      stepId: 'step-send-spec',
    },
  });

  assert(sendResultNull.allowed === true, 'Send action authorized by gate with valid Founder approval');
  assert(sendResultNull.result.deliveryStatus === 'failed', 'Delivery status is honestly failed when no provider is connected');
  assert(sendResultNull.result.error?.includes('NO_EXTERNAL_PROVIDER_CONFIGURED'), 'Error clearly states no external provider configured (never faking delivery)');

  // 3. Register a Mock Configured Provider Adapter to verify interface boundary
  class MockEmailProvider implements CommunicationProviderAdapter {
    readonly providerId = 'mock-ses-adapter';
    readonly channel = 'email' as const;
    sentMessages: Message[] = [];

    isConfigured(): boolean {
      return true;
    }

    async readMessages(_filter?: MessageFilter): Promise<Message[]> {
      return this.sentMessages;
    }

    async getThread(_threadId: string): Promise<MessageThread | null> {
      return null;
    }

    async sendMessage(message: Message, _approvalId?: string): Promise<{ success: boolean; externalMessageId: string; deliveryStatus: DeliveryStatus }> {
      this.sentMessages.push(message);
      return {
        success: true,
        externalMessageId: `ext-ses-${message.id}`,
        deliveryStatus: 'delivered',
      };
    }

    async getDeliveryStatus(_externalMessageId: string): Promise<DeliveryStatus> {
      return 'delivered';
    }
  }

  const mockProvider = new MockEmailProvider();
  providerRegistry.registerAdapter('email', mockProvider);

  // Create draft2 first before requesting approval
  const draft2 = await commRuntime.createDraft({
    conversationId: conv.id,
    authoringRole: 'pm',
    channel: 'email',
    intendedRecipients: [{ address: 'sarah.chen@innovatecorp.example', name: 'Sarah Chen' }],
    subject: 'Follow up: Verification',
    bodyContent: 'Verified integration specs.',
    workflowRef: {
      workflowId: 'wf-outreach-2',
      workflowInstanceId: 'inst-comm-2',
      stepId: 'step-send-spec-2',
    },
  });

  const draft2Payload = {
    draftId: draft2.id,
    conversationId: draft2.conversationId,
    threadId: draft2.threadId,
    sender: {
      address: 'pm@company.internal',
      name: 'PM',
    },
    recipients: draft2.intendedRecipients,
    cc: draft2.cc,
    bcc: draft2.bcc,
    subject: draft2.subject,
    bodyContent: draft2.bodyContent,
    bodyMimeType: draft2.bodyMimeType,
  };

  const draft2Target = {
    targetSystem: draft2.channel,
    recipient: draft2.intendedRecipients.map((r) => r.address).join(', '),
    summary: `Send approved draft: "${draft2.subject}"`,
  };

  // Request new single-action approval with payload binding for mock provider test
  const sendAppr2 = await gate.requestApproval({
    actionName: 'Send Integration Spec Email (Mock Provider)',
    classification: 'external_communication',
    workflowInstanceId: 'inst-comm-2',
    stepId: 'step-send-spec-2',
    employeeRole: 'pm',
    scope: { scopeType: 'step', workflowInstanceId: 'inst-comm-2', stepId: 'step-send-spec-2' },
    target: draft2Target,
    payload: draft2Payload,
  });
  await gate.decideApproval({
    approvalId: sendAppr2.id,
    decision: 'approved',
    decidedBy: 'founder',
  });

  const sendResultMock = await commRuntime.sendDraft({
    draftId: draft2.id,
    approvalId: sendAppr2.id,
    requestedBy: 'pm',
  });

  assert(sendResultMock.allowed === true, 'Mock send authorized by gate');
  assert(sendResultMock.result.deliveryStatus === 'delivered', 'Delivery status marked delivered when provider succeeds');
  assert(sendResultMock.result.externalMessageId === `ext-ses-${sendResultMock.result.message.id}`, 'External message ID preserved');

  // Verify message in store
  const storedMsg = await commStore.getMessage(sendResultMock.result.message.id);
  assert(storedMsg !== null && storedMsg.externalProviderRef?.startsWith('ext-ses-'), 'Stored message reflects external provider reference');

  // ==========================================
  // TEST GROUP 6: Workflow Integration & Scheduled Communication
  // ==========================================
  console.log('\n--- Test Group 6: Workflow & Scheduling Integration ---');

  const commRuntimeInstance = new WorkflowRuntime();
  const commScheduler = new WorkflowScheduler(schedulerStore, workflowStore, commRuntimeInstance);

  const commWfDef: WorkflowDefinition = {
    id: 'wf-comm-pipeline',
    version: '1.0.0',
    name: 'Customer Communication Pipeline',
    description: 'Prepare and dispatch client email with authorization',
    objective: 'Safely draft, approve, and dispatch customer email',
    steps: [
      {
        id: 'step-prep-email',
        name: 'Prepare Outreach Email',
        description: 'Draft outreach email',
        assignedRole: 'pm',
        skill: 'strategy_planning',
        dependencies: [],
        inputReferences: [],
        outputReferences: ['draft_email'],
        requiresApproval: false,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        sideEffectClassification: 'internal_mutation',
      },
      {
        id: 'step-send-email',
        name: 'Send Approved Outreach',
        description: 'Send outreach email to prospect',
        assignedRole: 'coo',
        skill: 'executive_dispatch',
        dependencies: ['step-prep-email'],
        inputReferences: ['draft_email'],
        outputReferences: ['sent_receipt'],
        requiresApproval: false,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
        sideEffectClassification: 'external_communication',
      },
    ],
  };

  await commRuntimeInstance.registerWorkflow(commWfDef);
  const wfInst = await commRuntimeInstance.createInstance('wf-comm-pipeline');

  // Step 1: Draft email (ready immediately)
  assert(wfInst.stepStates['step-prep-email'].status === 'ready', 'Step 1 (internal_mutation: prepare email) is ready');
  await commRuntimeInstance.executeReadyStep(wfInst.instanceId, 'step-prep-email');

  const instAfterStep1 = (await workflowStore.getInstance(wfInst.instanceId))!;
  assert(instAfterStep1.stepStates['step-prep-email'].status === 'completed', 'Step 1 completed');

  // Step 2: Send email (pauses at awaiting_approval)
  assert(instAfterStep1.stepStates['step-send-email'].status === 'awaiting_approval', 'Step 2 (external_communication: send email) automatically pauses at awaiting_approval');

  // Schedule Step 2 for future wake
  const futureWake = new Date(Date.now() + 60000).toISOString();
  await commScheduler.scheduleWork({
    workflowInstanceId: wfInst.instanceId,
    stepId: 'step-send-email',
    scheduleType: 'delayed',
    executeAt: futureWake,
  });

  // Wake time arrives before approval -> Scheduler skips execution because status is still awaiting_approval
  const wakeTime1 = new Date(Date.now() + 120000).toISOString();
  const wakeResultUnapproved = await commScheduler.evaluateDueWork(wakeTime1);
  assert(
    wakeResultUnapproved.results.some((r) => r.status === 'awaiting_approval' || r.status === 'skipped'),
    'Scheduled wake skips execution while step is awaiting Founder approval'
  );

  // Founder approves Step 2
  await commRuntimeInstance.approveStep(wfInst.instanceId, 'step-send-email', 'founder', 'Customer communication approved');
  const instAfterAppr = (await workflowStore.getInstance(wfInst.instanceId))!;
  assert(instAfterAppr.stepStates['step-send-email'].status === 'ready', 'Step 2 transitions to ready after Founder approval');

  // Execute Step 2
  await commRuntimeInstance.executeReadyStep(wfInst.instanceId, 'step-send-email');
  const finalWfInst = (await workflowStore.getInstance(wfInst.instanceId))!;
  assert(finalWfInst.stepStates['step-send-email'].status === 'completed', 'Step 2 completed successfully after authorization');
  assert(finalWfInst.status === 'completed', 'Overall communication workflow instance completed');

  console.log('\n======================================================');
  console.log('Phase 12.4 Test Suite Complete: All Tests Passed');
  console.log('======================================================');
}

runPhase12_4Tests().catch((err) => {
  console.error('Fatal Phase 12.4 test error:', err);
  process.exit(1);
});
