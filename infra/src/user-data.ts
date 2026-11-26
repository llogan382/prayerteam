// Boot script for the API instance. It prepares the host only; the first
// deploy (deploy.sh through SSM Run Command) starts the app.
const COMPOSE_VERSION = 'v5.8.0';

export interface UserDataOptions {
  systemLogGroup: string;
}

export function instanceUserData({ systemLogGroup }: UserDataOptions): string[] {
  const agentConfig = JSON.stringify({
    logs: {
      logs_collected: {
        files: {
          collect_list: [
            '/var/log/messages',
            '/var/log/cloud-init-output.log',
            '/var/log/amazon/ssm/amazon-ssm-agent.log',
          ].map((file_path) => ({
            file_path,
            log_group_name: systemLogGroup,
            log_stream_name: `{instance_id}${file_path}`,
          })),
        },
      },
    },
  });
  const composeUrl = `https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-aarch64`;

  return [
    'set -euxo pipefail',
    // 1 GB of swap as headroom for the blue/green overlap on a 1 GB instance.
    'fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile',
    "echo '/swapfile none swap defaults 0 0' >> /etc/fstab",
    'dnf install -y docker amazon-cloudwatch-agent rsyslog',
    'systemctl enable --now rsyslog',
    // Compose plugin, checked against the release's published checksum.
    'mkdir -p /usr/local/lib/docker/cli-plugins && cd /usr/local/lib/docker/cli-plugins',
    `curl -fsSL -o docker-compose ${composeUrl}`,
    `curl -fsSL ${composeUrl}.sha256 | sed 's/docker-compose-linux-aarch64/docker-compose/' | sha256sum -c -`,
    'chmod +x docker-compose && cd /',
    // Docker starts on boot, and containers with restart: unless-stopped come
    // back after a patch reboot or auto-recovery.
    'systemctl enable --now docker',
    'mkdir -p /opt/prayerteam',
    `cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'JSON'\n${agentConfig}\nJSON`,
    '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json',
  ];
}
