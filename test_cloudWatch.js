const {
  CloudWatchClient,
  GetMetricStatisticsCommand
} = require("@aws-sdk/client-cloudwatch");

const client = new CloudWatchClient({
  region: "ap-southeast-2"
});

async function getCpuMetrics() {
  const endTime = new Date();
  const startTime = new Date(
    endTime.getTime() - 60 * 60 * 1000
  );

  const command = new GetMetricStatisticsCommand({
    Namespace: "AWS/EC2",
    MetricName: "CPUUtilization",
    Dimensions: [
      {
        Name: "InstanceId",
        Value: "i-01fb627927411c6f6"
      }
    ],
    StartTime: startTime,
    EndTime: endTime,
    Period: 300,
    Statistics: ["Average"]
  });

  const result = await client.send(command);

  const points = (result.Datapoints || [])
    .sort((a, b) => a.Timestamp - b.Timestamp)
    .map(point => ({
      time: point.Timestamp,
      averageCpuPercent: point.Average
    }));

  console.log(JSON.stringify(points, null, 2));
}

getCpuMetrics().catch(console.error);
