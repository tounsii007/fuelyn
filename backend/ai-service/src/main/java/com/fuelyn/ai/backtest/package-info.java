/**
 * Backtest harness for the heuristic advisor.
 *
 * <h2>How to run</h2>
 *
 * <p>From the repo root, execute the runner against a JSON fixture
 * (the test resource ships a small synthetic one):</p>
 *
 * <pre>{@code
 *   mvn -pl ai-service -am compile
 *   mvn -pl ai-service exec:java \
 *     -Dexec.mainClass=com.fuelyn.ai.backtest.BacktestRunner \
 *     -Dexec.args="path/to/fixture.json"
 * }</pre>
 *
 * <p>Or wire it into the price-service later: a nightly job pulls
 * the last N days of MTS-K snapshots from PostgreSQL, dumps a
 * fixture, runs the backtest, and publishes the report to a
 * dashboard.</p>
 *
 * <h2>What it answers</h2>
 *
 * <ul>
 *   <li>Is the heuristic better than "always buy now"?</li>
 *   <li>Is it better than the naive "wait until Tuesday 19h" rule?</li>
 *   <li>Where does it lose the most? (mean regret split by buy vs.
 *       wait makes that visible)</li>
 *   <li>How does a weight change in {@link com.fuelyn.ai.fallback.LocalHeuristicFallback}
 *       affect the aggregate? Compare two reports.</li>
 * </ul>
 */
package com.fuelyn.ai.backtest;
