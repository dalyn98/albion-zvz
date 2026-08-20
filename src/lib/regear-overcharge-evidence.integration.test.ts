import { afterEach, describe, expect, it } from 'vitest'
import {
  getTestServiceClient,
  hasTestEnv,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip
const uploadedPaths: string[] = []

describeIntegration('OC regear GIF storage contract (migration 416)', () => {
  afterEach(async () => {
    if (uploadedPaths.length === 0) return
    const paths = uploadedPaths.splice(0)
    await getTestServiceClient().storage.from('regear-screenshots').remove(paths)
  })

  it('accepts GIF evidence in the private regear screenshot bucket', async () => {
    const path = `integration/oc-evidence-${crypto.randomUUID()}.gif`
    const gif = new Blob([new TextEncoder().encode('GIF89a')], { type: 'image/gif' })
    const { error } = await getTestServiceClient().storage
      .from('regear-screenshots')
      .upload(path, gif, { contentType: 'image/gif', upsert: false })

    if (!error) uploadedPaths.push(path)
    expect(error).toBeNull()
  })
})
