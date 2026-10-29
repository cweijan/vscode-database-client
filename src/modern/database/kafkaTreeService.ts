import {
  ConfigResourceTypes,
  type Admin,
} from "kafkajs";

import type { ConnectionOptions } from "./types";
import { createKafkaClient } from "./messageFactories";

export interface KafkaBrokerInfo {
  readonly nodeId: number;
  readonly host: string;
  readonly port: number;
}

export interface KafkaPartitionInfo {
  readonly partitionId: number;
  readonly replicas: readonly number[];
  readonly leader: number;
}

export interface KafkaTopicInfo {
  readonly name: string;
  readonly partitions: readonly KafkaPartitionInfo[];
}

export interface KafkaTopicOffsetInfo {
  readonly partition: number;
  readonly offset: string;
  readonly high: string;
  readonly low: string;
}

export interface KafkaConfigInfo {
  readonly name: string;
  readonly value: string;
}

export interface KafkaConsumerGroupInfo {
  readonly groupId: string;
  readonly protocolType: string;
}

export interface KafkaConsumerMemberInfo {
  readonly clientId: string;
  readonly clientHost: string;
  readonly memberId: string;
}

export interface KafkaConsumerGroupDetail {
  readonly state: string;
  readonly members: readonly KafkaConsumerMemberInfo[];
}

export interface KafkaGroupOffsetInfo {
  readonly topic: string;
  readonly partition: number;
  readonly offset: string;
}

export class KafkaTreeService {
  private async withAdmin<T>(
    connection: ConnectionOptions,
    operation: (admin: Admin) => Promise<T>,
  ): Promise<T> {
    const admin = createKafkaClient(connection).admin();
    await admin.connect();
    try {
      return await operation(admin);
    } finally {
      await admin.disconnect();
    }
  }

  public listBrokers(connection: ConnectionOptions): Promise<KafkaBrokerInfo[]> {
    return this.withAdmin(connection, async (admin) => {
      const cluster = await admin.describeCluster();
      return cluster.brokers.map((broker) => ({
        nodeId: broker.nodeId,
        host: broker.host,
        port: broker.port,
      }));
    });
  }

  public listTopics(connection: ConnectionOptions): Promise<KafkaTopicInfo[]> {
    return this.withAdmin(connection, async (admin) => {
      const names = await admin.listTopics();
      if (!names.length) return [];
      const metadata = await admin.fetchTopicMetadata({ topics: names });
      return metadata.topics.map((topic) => ({
        name: topic.name,
        partitions: topic.partitions.map((partition) => ({
          partitionId: partition.partitionId,
          replicas: partition.replicas,
          leader: partition.leader,
        })),
      }));
    });
  }

  public topicOffsets(
    connection: ConnectionOptions,
    topic: string,
  ): Promise<KafkaTopicOffsetInfo[]> {
    return this.withAdmin(connection, async (admin) => admin.fetchTopicOffsets(topic));
  }

  public topicConfigs(
    connection: ConnectionOptions,
    topic: string,
  ): Promise<KafkaConfigInfo[]> {
    return this.withAdmin(connection, async (admin) => {
      const response = await admin.describeConfigs({
        includeSynonyms: false,
        resources: [{ type: ConfigResourceTypes.TOPIC, name: topic }],
      });
      return (response.resources[0]?.configEntries || []).map((entry) => ({
        name: entry.configName,
        value: entry.configValue,
      }));
    });
  }

  public brokerConfigs(
    connection: ConnectionOptions,
    brokerId: string,
  ): Promise<KafkaConfigInfo[]> {
    return this.withAdmin(connection, async (admin) => {
      const response = await admin.describeConfigs({
        includeSynonyms: false,
        resources: [{ type: ConfigResourceTypes.BROKER, name: brokerId }],
      });
      return (response.resources[0]?.configEntries || []).map((entry) => ({
        name: entry.configName,
        value: entry.configValue,
      }));
    });
  }

  public createTopic(
    connection: ConnectionOptions,
    topic: string,
    partitions: number,
    replicationFactor: number,
  ): Promise<boolean> {
    return this.withAdmin(connection, (admin) =>
      admin.createTopics({
        topics: [{ topic, numPartitions: partitions, replicationFactor }],
      }),
    );
  }

  public async deleteTopic(connection: ConnectionOptions, topic: string): Promise<void> {
    await this.withAdmin(connection, (admin) => admin.deleteTopics({ topics: [topic] }));
  }

  public listConsumerGroups(
    connection: ConnectionOptions,
  ): Promise<KafkaConsumerGroupInfo[]> {
    return this.withAdmin(connection, async (admin) => {
      const response = await admin.listGroups();
      return response.groups.map((group) => ({
        groupId: group.groupId,
        protocolType: group.protocolType,
      }));
    });
  }

  public describeConsumerGroup(
    connection: ConnectionOptions,
    groupId: string,
  ): Promise<KafkaConsumerGroupDetail> {
    return this.withAdmin(connection, async (admin) => {
      const group = (await admin.describeGroups([groupId])).groups[0];
      return {
        state: group?.state || "Unknown",
        members: (group?.members || []).map((member) => ({
          clientId: member.clientId,
          clientHost: member.clientHost,
          memberId: member.memberId,
        })),
      };
    });
  }

  public consumerGroupOffsets(
    connection: ConnectionOptions,
    groupId: string,
    topics: readonly string[],
  ): Promise<KafkaGroupOffsetInfo[]> {
    return this.withAdmin(connection, async (admin) => {
      const topicNames = topics.length
        ? topics
        : (await admin.listTopics());
      const response = await admin.fetchOffsets({
        groupId,
        topics: [...topicNames],
      });
      return response.flatMap((topic) =>
        topic.partitions.map((partition) => ({
          topic: topic.topic,
          partition: partition.partition,
          offset: partition.offset,
        })),
      );
    });
  }

  public async deleteConsumerGroup(
    connection: ConnectionOptions,
    groupId: string,
  ): Promise<void> {
    await this.withAdmin(connection, (admin) => admin.deleteGroups([groupId]).then(() => undefined));
  }

  public async setOffset(
    connection: ConnectionOptions,
    groupId: string,
    topic: string,
    partition: number,
    offset: string,
  ): Promise<void> {
    await this.withAdmin(connection, (admin) =>
      admin.setOffsets({
        groupId,
        topic,
        partitions: [{ partition, offset }],
      }),
    );
  }

  public async resetOffset(
    connection: ConnectionOptions,
    groupId: string,
    topic: string,
  ): Promise<void> {
    await this.withAdmin(connection, (admin) =>
      admin.resetOffsets({ groupId, topic, earliest: true }),
    );
  }
}
