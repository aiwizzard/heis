let workflowId: string | null = null;
let runId: string | null = null;

export const setWorkflowIds = (wfId: string | null, rId: string | null) => {
  workflowId = wfId;
  runId = rId;
};

export const getWorkflowId = () => workflowId;
export const getRunId = () => runId;
