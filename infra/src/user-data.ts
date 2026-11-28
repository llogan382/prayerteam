// Boot script for the API instance. It prepares the host only; the first
// deploy (deploy.sh through SSM Run Command) starts the app.
const COMPOSE_VERSION = "v5.8.0";

export interface UserDataOptions {
  systemLogGroup: string;
  containerLogGroup: string;
}

export function instanceUserData({ systemLogGroup, containerLogGroup }: UserDataOptions): string[] {
  const collect = (log_group_name: string, file_path: string, log_stream_name: string) => ({
    file_path,
    log_group_name,
    log_stream_name,
  });
  const agentConfig = JSON.stringify({
    logs: {
      logs_collected: {
        files: {
          collect_list: [
            // rsyslog writes /var/log/messages; AL2023 only has the journal,
            // which the agent can't read.
            ...["/var/log/messages", "/var/log/cloud-init-output.log", "/var/log/amazon/ssm/amazon-ssm-agent.log"].map(
              (file) => collect(systemLogGroup, file, `{instance_id}${file}`),
            ),
            // Docker's json-file driver: one JSON object per line, each tagged
            // with its container name (compose.yaml). New containers' files
            // match the wildcard and are picked up as they appear.
            collect(containerLogGroup, "/var/lib/docker/containers/*/*-json.log", "{instance_id}/containers"),
          ],
        },
      },
    },
  });
  const composeUrl = `https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-aarch64`;

  return [
    "set -euxo pipefail",
    "dnf install -y docker amazon-cloudwatch-agent rsyslog",
    "systemctl enable --now rsyslog",
    // Compose plugin, checked against the release's published checksum.
    "mkdir -p /usr/local/lib/docker/cli-plugins && cd /usr/local/lib/docker/cli-plugins",
    `curl -fsSL -o docker-compose ${composeUrl}`,
    `curl -fsSL ${composeUrl}.sha256 | sed 's/docker-compose-linux-aarch64/docker-compose/' | sha256sum -c -`,
    "chmod +x docker-compose && cd /",
    // Docker starts on boot, and containers with restart: unless-stopped come
    // back after a patch reboot or auto-recovery.
    "systemctl enable --now docker",
    "mkdir -p /opt/prayerteam",
    `cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'JSON'\n${agentConfig}\nJSON`,
    "/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
  ];
}
