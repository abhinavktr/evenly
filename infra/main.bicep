// Evenly backend: Cosmos DB (serverless) + Azure Functions (Flex Consumption, Node 22) + App Insights.
// Deploy:  az deployment group create -g <rg> -f infra/main.bicep -p entraTenantId=... entraTenantSubdomain=... entraApiClientId=...

@description('Short prefix for resource names (lowercase letters/numbers).')
@maxLength(10)
param prefix string = 'evenly'

param location string = resourceGroup().location

@description('Directory (tenant) ID of your Microsoft Entra External ID tenant.')
param entraTenantId string

@description('Subdomain of the external tenant, e.g. "evenlyapp" for evenlyapp.ciamlogin.com.')
param entraTenantSubdomain string

@description('Application (client) ID of the Evenly app registration in the external tenant.')
param entraApiClientId string

var suffix = uniqueString(resourceGroup().id)
var storageName = toLower('${prefix}st${take(suffix, 10)}')
var cosmosName = toLower('${prefix}-cosmos-${suffix}')
var funcName = toLower('${prefix}-api-${suffix}')
var deployContainer = 'deployments'

// ---------- Monitoring ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs-${suffix}'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-ai-${suffix}'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

// ---------- Storage (Functions runtime + deployment packages) ----------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource deployments 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deployContainer
}

// ---------- Cosmos DB (serverless, NoSQL API) ----------
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [ { locationName: location, failoverPriority: 0 } ]
    capabilities: [ { name: 'EnableServerless' } ]
    minimalTlsVersion: 'Tls12'
    disableLocalAuth: false // keys allowed for local development; the deployed API uses its managed identity
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'evenly'
  properties: { resource: { id: 'evenly' } }
}

resource containers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [for c in [ 'users', 'groups', 'expenses' ]: {
  parent: database
  name: c
  properties: {
    resource: {
      id: c
      partitionKey: { paths: [ '/id' ], kind: 'Hash' }
      indexingPolicy: { indexingMode: 'consistent', includedPaths: [ { path: '/*' } ] }
    }
  }
}]

// ---------- Function App (Flex Consumption) ----------
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${prefix}-plan-${suffix}'
  location: location
  kind: 'functionapp'
  sku: { tier: 'FlexConsumption', name: 'FC1' }
  properties: { reserved: true }
}

resource func 'Microsoft.Web/sites@2024-04-01' = {
  name: funcName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
        { name: 'COSMOS_DATABASE', value: 'evenly' }
        { name: 'ENTRA_TENANT_ID', value: entraTenantId }
        { name: 'ENTRA_TENANT_SUBDOMAIN', value: entraTenantSubdomain }
        { name: 'ENTRA_API_CLIENT_ID', value: entraApiClientId }
        { name: 'AUTH_MODE', value: 'entra' }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deployContainer}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      scaleAndConcurrency: { maximumInstanceCount: 40, instanceMemoryMB: 2048 }
      runtime: { name: 'node', version: '22' }
    }
  }
}

// ---------- Role assignments for the Function App's managed identity ----------
var storageBlobDataOwner = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var storageQueueDataContributor = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageTableDataContributor = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource storageRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for role in [ storageBlobDataOwner, storageQueueDataContributor, storageTableDataContributor ]: {
  name: guid(storage.id, func.id, role)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role)
    principalId: func.identity.principalId
    principalType: 'ServicePrincipal'
  }
}]

// Cosmos DB Built-in Data Contributor (data-plane RBAC)
resource cosmosRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, func.id, 'data-contributor')
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: func.identity.principalId
    scope: cosmos.id
  }
}

output functionAppName string = func.name
output apiUrl string = 'https://${func.properties.defaultHostName}/api'
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output cosmosAccountName string = cosmos.name
