/**
 * SF Flow Utility Toolkit - Flow Health Exporter
 */

const FlowHealthExporter = (() => {

  function buildMarkdownReport(report) {
    const lines = [];

    lines.push('# Flow Health Check Summary');
    lines.push('');
    lines.push('## Flow');
    lines.push(`- Label: ${report.meta.flowLabel}`);
    lines.push(`- API Name: ${report.meta.flowApiName}`);
    lines.push(`- Type: ${report.meta.flowType}`);
    lines.push(`- API Version: ${report.meta.apiVersion ?? 'Unknown'}`);
    lines.push(`- Status: ${report.meta.status || 'Unknown'}`);
    lines.push('');
    lines.push('## Score');
    lines.push(`- Overall: ${report.summary.overallScore}`);
    lines.push(`- Rating: ${report.summary.rating}`);
    lines.push('');
    lines.push('## Findings by Severity');
    lines.push(`- High: ${report.summary.severityCounts.high}`);
    lines.push(`- Medium: ${report.summary.severityCounts.medium}`);
    lines.push(`- Low: ${report.summary.severityCounts.low}`);
    lines.push(`- Info: ${report.summary.severityCounts.info}`);
    lines.push('');
    lines.push('## Key Issue Families');

    report.issueFamilies.slice(0, 10).forEach((family, index) => {
      lines.push(`${index + 1}. [${family.severity.toUpperCase()}] ${family.title} (${family.instanceCount})`);
    });

    lines.push('');
    lines.push('## Dependencies');
    lines.push(`- Apex Actions: ${report.dependencies.counts.apexActions}`);
    lines.push(`- Subflows: ${report.dependencies.counts.subflows}`);
    lines.push(`- LWCs: ${report.dependencies.counts.lwcComponents}`);
    lines.push(`- Apex Defined Types: ${report.dependencies.counts.apexDefinedTypes}`);
    lines.push(`- External Actions: ${report.dependencies.counts.externalActions}`);

    return lines.join('\n');
  }

  function buildImprovementPrompt(report, basePrompt = '') {
    const sections = [];

    if (basePrompt) {
      sections.push(basePrompt.trim());
      sections.push('');
    }

    sections.push('Additional context from Flow Health Check:');
    sections.push('');
    sections.push('Flow Summary:');
    sections.push(`- Flow: ${report.meta.flowLabel}`);
    sections.push(`- API Name: ${report.meta.flowApiName}`);
    sections.push(`- Type: ${report.meta.flowType}`);
    sections.push(`- API Version: ${report.meta.apiVersion ?? 'Unknown'}`);
    sections.push(`- Status: ${report.meta.status || 'Unknown'}`);
    sections.push(`- Health Score: ${report.summary.overallScore} (${report.summary.rating})`);
    sections.push(`- Elements: ${report.summary.metrics.elementCount}`);
    sections.push(`- Decisions: ${report.summary.metrics.decisionCount}`);
    sections.push(`- Loops: ${report.summary.metrics.loopCount}`);
    sections.push(`- Data Operations: ${report.summary.metrics.dataOperationCount}`);
    sections.push('');
    sections.push('Issue Families:');

    report.issueFamilies.forEach((family) => {
      sections.push(`- [${family.severity.toUpperCase()}] ${family.title} (${family.instanceCount} instance${family.instanceCount === 1 ? '' : 's'})`);
    });

    sections.push('');
    sections.push('Dependencies:');
    report.dependencies.items.forEach((item) => {
      sections.push(`- ${item.type}: ${item.name}`);
    });

    sections.push('');
    sections.push('Please refine the improvement recommendations using this health check context. Prioritise the most important changes first and explain why.');

    return sections.join('\n');
  }

  return {
    buildMarkdownReport,
    buildImprovementPrompt
  };

})();