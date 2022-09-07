import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as fs from "fs";

const appLabels = { app: "fluentd" };

const configMap = new k8s.core.v1.ConfigMap("fluentd-configmap", {
    metadata: {
        name: "fluentd-configmap",
        namespace: "monitoring",
    },
    data: {
        "fluent.conf": fs.readFileSync('fluent.conf').toString(),
    },
});


// Create a ServiceAccount for the DaemonSet
const serviceAccount = new k8s.core.v1.ServiceAccount("fluentd", {
    metadata: {
        name: "fluentd",
        namespace: "monitoring",
        labels: appLabels,
    },
});

// Create a ClusterRoleBinding for the ServiceAccount
const clusterRoleBinding = new k8s.rbac.v1.ClusterRoleBinding("fluentd", {
    metadata: {
        name: "fluentd",
    },
    subjects: [{
        kind: "ServiceAccount",
        name: serviceAccount.metadata.name,
        namespace: serviceAccount.metadata.namespace,
    }],
    roleRef: {
        kind: "ClusterRole",
        name: "fluentd",
        apiGroup: "rbac.authorization.k8s.io",
    },
});

// Create a ClusterRoleBinding for the ServiceAccount
const clusterRole = new k8s.rbac.v1.ClusterRole("fluentd", {
    metadata: {
        name: "fluentd",
        labels: appLabels,
    },
    rules: [
        {
            apiGroups: [""],
            resources: ["pods"],
            verbs: ["get", "list", "watch"],
        },
        {
            apiGroups: ["apps"],
            resources: ["replicasets"],
            verbs: ["get", "list", "watch"],
        },
    ],
});


// Create a DaemonSet
const fluentd = new k8s.apps.v1.DaemonSet("fluentd", {
    metadata: {
        name: "fluentd",
        namespace: "monitoring",
        labels: appLabels,
    },
    spec: {
        selector: {
            matchLabels: appLabels,
        },
        template: {
            metadata: {
                labels: appLabels,
            },
            spec: {
                serviceAccountName: serviceAccount.metadata.name,
                tolerations: [
                    {
                        key: "node-role.kubernetes.io/control-plane",
                        effect: "NoSchedule",
                    },
                    {
                        key: "node-role.kubernetes.io/master",
                        effect: "NoSchedule",
                    },
                ],
                containers: [
                    {
                        name: "fluentd",
                        image: "fluent/fluentd-kubernetes-daemonset:v1-debian-elasticsearch",
                        env: [
                            {
                                name: "FLUENT_ELASTICSEARCH_HOST",
                                value: "elasticsearch.monitoring",
                            },
                            {
                                name: "FLUENT_ELASTICSEARCH_PORT",
                                value: "9200",
                            },
                            {
                                name: "FLUENT_ELASTICSEARCH_SCHEME",
                                value: "http",
                            },
                            {
                                name: "FLUENTD_SYSTEMD_CONF",
                                value: "disable",
                            },
                            {
                                name: "FLUENT_ELASTICSEARCH_SSL_VERIFY",
                                value: "false",
                            },
                            {
                                name: "FLUENT_ELASTICSEARCH_LOGSTASH_PREFIX",
                                value: "fluentd",
                            },
                            {
                                name: "FLUENT_ELASTICSEARCH_LOGSTASH_INDEX_NAME",
                                value: "fluentd",
                            },
                            {
                                name: "FLUENT_ELASTICSEARCH_LOGSTASH_TYPE_NAME",
                                value: "access_log",
                            },
                            {
                                name: "FLUENT_ELASTICSEARCH_USER",
                                value: "elastic",
                            },
                            {
                                name: "FLUENT_ELASTICSEARCH_PASSWORD",
                                value: "changeme",
                            },
                            {
                                name: "K8S_NODE_NAME",
                                valueFrom: {
                                    fieldRef: {
                                        fieldPath: "spec.nodeName",
                                    },
                                },
                            },
                        ],
                        resources: {
                            limits: {
                                memory: "200Mi",
                            },
                            requests: {
                                cpu: "100m",
                                memory: "200Mi",
                            },
                        },
                        ports: [
                            {
                                containerPort: 24224,
                                name: "fluentd-tcp",
                                protocol: "TCP",
                            },
                            {
                                containerPort: 24224,
                                name: "fluentd-udp",
                                protocol: "UDP",
                            },
                        ],
                        volumeMounts: [
                            {
                                name: "varlog",
                                mountPath: "/var/log",
                            },
                            {
                                name: "fluentd-configmap-volume",
                                mountPath: "/fluentd/etc",
                            },
                            {
                                name: "dockercontainerlogdirectory",
                                mountPath: "/var/log/pods",
                                readOnly: true,
                            },
                        ],
                    },
                ],
                terminationGracePeriodSeconds: 30,
                volumes: [
                    {
                        name: "varlog",
                        hostPath: {
                            path: "/var/log",
                        },
                    },
                    {
                        name: "dockercontainerlogdirectory",
                        hostPath: {
                            path: "/var/log/pods",
                        },
                    },
                    {
                        name: "fluentd-configmap-volume",
                        configMap: {
                            name: "fluentd-configmap",
                            items: [
                                {
                                    key: "fluent.conf",
                                    path: "fluent.conf",
                                },
                            ],
                        },
                    },
                ],
            },
        },
    },
});


export const name = fluentd.metadata.name;
