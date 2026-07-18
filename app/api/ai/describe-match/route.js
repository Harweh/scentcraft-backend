import { NextResponse } from 'next/server'
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb'
import { MongoClient } from 'mongodb'
import embeddings from '@/app/lib/embeddings.js'
import OpenAI from 'openai'
import { MIXING_FEE, VIAL_COST, buildBlendRecipe, BLEND_VOLUME_OPTIONS, DEFAULT_BLEND_VOLUME } from '@/app/lib/pricing.js'


// This tells Next.js to run this route in Node.js runtime
// Required because @langchain/mongodb only works in Node — not the Edge runtime
export const runtime = 'nodejs'

/**
 * @swagger
 * /api/ai/describe-match:
 *   post:
 *     summary: AI-matched perfume from a mood description
 *     description: Embeds the customer's description, searches the vector index for the closest real fragrances, and generates a name + description using only matched results (RAG)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description]
 *             properties:
 *               description:
 *                 type: string
 *                 example: I want to feel warm, confident and mysterious
 *               gender:
 *                 type: string
 *                 enum: [male, female, unisex]
 *     responses:
 *       200:
 *         description: Matched fragrances with AI-generated name and description
 *       400:
 *         description: Description missing or too short
 *       404:
 *         description: No matching fragrances found
 */



// ══════════════════════════════════════════════════════
// POST /api/ai/describe-match
// The full RAG pipeline — search + generate
//
// Request body:
// {
//   description: "I want to feel warm and mysterious",
//   gender: "female" | "male" | "unisex"  ← optional
//   volume: 15 | 30 | 50 | 100             ← optional, defaults to 30
// }
//
// Response:
// {
//   success: true,
//   perfumeName: "Golden Ember",
//   scentDescription: "A rich, enveloping blend...",
//   mixingInstructions: { blendName, totalVolume, recipe: [...], steps: [...], notes },
//   pricing: { fragranceCost, mixingFee, vialCost, totalAmount }
// }
// ══════════════════════════════════════════════════════
export async function POST(request) {
    let client = null

    try {
        // ── STEP 1: Read and validate the request
        const body = await request.json()
        const { description, gender } = body

        let { volume } = body
        if (!BLEND_VOLUME_OPTIONS.includes(volume)) volume = DEFAULT_BLEND_VOLUME

        if (!description || description.trim().length < 5) {
        return NextResponse.json(
            {
            success: false,
            message: 'Please describe how you want to feel in at least a few words',
            },
            { status: 400 }
        )
        }

        // ── STEP 2: Connect to MongoDB using native driver ─────
        // Important: LangChain's MongoDBAtlasVectorSearch uses the
        // NATIVE MongoDB driver directly, not Mongoose.
        // That's why we use MongoClient here instead of our connectDB()
        // utility — they're two different ways to talk to the same database
        client = new MongoClient(process.env.MONGODB_URI)
        await client.connect()

        const db = client.db('scentcraft')
        const collection = db.collection('fragrances')

        // ── STEP 3: Set up the vector store
        // MongoDBAtlasVectorSearch connects our embeddings model
        // to the vector_index we created in Step 9.
        // It knows WHERE to search (our collection) and
        // HOW to search (using our embeddings to convert text → numbers)
        const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
        collection,
        indexName: 'vector_index',    // must match exactly what we named it in Atlas
        textKey: 'description',       // the field Atlas indexes text from
        embeddingKey: 'embedding',    // the field storing our 384 numbers
        })

        // ── STEP 4: Semantic search ────────────────────────────
        // This is the core of RAG — "Retrieval"
        // similaritySearch() does three things automatically:
        // 1. Embeds the customer's description using our HuggingFace model
        // 2. Runs cosine similarity against all 384-number vectors in Atlas
        // 3. Returns the top 3 most semantically similar fragrances
        //
        // "warm and confident" will match Sandalwood + Amber even though
        // those exact words never appear in either description
        // DEBUG: how many docs does the driver see, and do they have real embeddings?
        const totalDocs = await collection.countDocuments()
        const sampleDoc = await collection.findOne({})
        console.log('🔍 DEBUG total docs in collection:', totalDocs)
        console.log('🔍 DEBUG sample doc embedding length:', sampleDoc?.embedding?.length ?? 'NO EMBEDDING FIELD')
        console.log('🔍 DEBUG sample doc keys:', sampleDoc ? Object.keys(sampleDoc) : 'NO DOC FOUND')

        let results
        try {
          results = await vectorStore.similaritySearch(description.trim(), 3 || 2)
          console.log('🔍 DEBUG similaritySearch returned:', results.length, 'results')
        } catch (searchErr) {
          console.error('🔍 DEBUG similaritySearch THREW:', searchErr)
          throw searchErr
        }

        if (!results || results.length === 0) {
        return NextResponse.json(
            {
            success: false,
            message: 'No matching fragrances found. Try describing your mood differently.',
            },
            { status: 404 }
        )
        }

        // ── STEP 5: Extract matched fragrance data ─────────────
        // results comes back as LangChain Document objects
        // Each has a .metadata field containing the original MongoDB document
        const rawMatches = results.map((doc, index) => {
        // Best match becomes the Heart note (the dominant, center note in
        // real perfumery) rather than an arbitrary flat list.
        const roles = ['Heart', 'Top', 'Base']
        return {
            name: doc.metadata.name,
            emoji: doc.metadata.emoji,
            category: doc.metadata.category,
            description: doc.metadata.description,
            pricePerMl: doc.metadata.pricePerMl,
            color: doc.metadata.color,
            imageUrl: doc.metadata.imageUrl || null,
            role: roles[index] || 'Base',
        }
        })

        // ── STEP 6: Combine into ONE blend recipe ───────────────
        // Instead of 3 separate purchasable fragrances, this turns the
        // matches into ONE recipe: role-based volumes (Top/Heart/Base
        // ratios) that sum to the customer's chosen total volume.
        const { recipe, totalVolume, fragranceCost } = buildBlendRecipe(rawMatches, volume)
        const mixingFee = MIXING_FEE
        const vialCost  = VIAL_COST
        const totalAmount = fragranceCost + mixingFee + vialCost

        // ── STEP 7: Build the Puter prompt ─────────────────────
        // This is where gender acts as a SOFT SIGNAL, not a hard filter
        // The customer's own words ("warm and mysterious") always take priority
        // Gender just adjusts the tone and vocabulary of the output description
        const fragranceList = recipe
        .map(f => `${f.emoji} ${f.name} (${f.role} note, ${f.percentage}% — ${f.volume}ml) — ${f.description}`)
        .join('\n')

        const genderContext = gender && gender !== 'unisex'
        ? `The customer identifies as ${gender} and generally leans toward ${
            gender === 'female'
                ? 'floral, warm, and romantic scents — though their mood description takes priority'
                : 'woody, fresh, and bold scents — though their mood description takes priority'
            }.`
        : 'The customer has no gender preference — suggest a universally appealing blend.'

        const systemPrompt = `You are a master perfumer and poet at a luxury fragrance studio. 
    You create evocative, beautiful descriptions of custom perfume blends, and clear step-by-step
    mixing instructions for the studio's own perfumer to follow when physically blending the vial.
    Your tone is warm, sensory, and aspirational — like a high-end fragrance brand.
    Always respond in valid JSON only. No markdown, no extra text.`

        const userPrompt = `A customer wants to feel: "${description}"

    ${genderContext}

    Our perfumers have selected these exact fragrance notes to combine into ONE blend,
    totaling ${totalVolume}ml:
    ${fragranceList}

    Create a custom perfume for this customer using ONLY these exact fragrances, combined
    into a single blended recipe (not sold as separate fragrances).

    Respond with this exact JSON structure:
    {
    "perfumeName": "A creative 2-3 word perfume name that captures the mood",
    "scentDescription": "A rich 3-4 sentence description of how this blend smells, how it makes you feel, and when to wear it. Be poetic and sensory.",
    "steps": ["Step 1 instruction for the perfumer mixing this exact recipe", "Step 2...", "Step 3...", "Step 4..."],
    "notes": "One short practical tip for the perfumer about this specific blend (e.g. settling time, shake instructions)"
    }`

        // ── STEP 8: Call Puter for AI generation ──────────────
        // This is where Puter does its job — "Generation" in RAG
        // We use the OpenAI SDK pointed at Puter's free endpoint
        // instead of OpenAI's paid servers
        const puterClient = new OpenAI({
        apiKey: process.env.PUTER_AUTH_TOKEN,
        baseURL: 'https://api.puter.com/puterai/openai/v1/',
        })

        const aiResponse = await puterClient.chat.completions.create({
        model: 'gpt-4o-mini',   // Puter supports this model for free
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
        ],
        temperature: 0.8,       // slightly creative but not too random
        max_tokens: 600,
        })

        // ── STEP 9: Parse Puter's response ────────────────────
        const rawText = aiResponse.choices[0].message.content.trim()

        let perfumeName, scentDescription, steps, mixingNotes

        try {
        // Strip any accidental markdown backticks if Puter added them
        const cleaned = rawText.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        perfumeName = parsed.perfumeName
        scentDescription = parsed.scentDescription
        steps = Array.isArray(parsed.steps) ? parsed.steps : []
        mixingNotes = parsed.notes || ''
        } catch {
        // If JSON parsing fails, extract manually as a fallback
        // so we never return a 500 just because of formatting
        console.warn('Puter response was not clean JSON — extracting manually')
        perfumeName = 'Signature Blend'
        scentDescription = rawText
        // Generic fallback steps so the admin still has something usable
        // to work from even if the AI's formatting broke.
        steps = [
            `Measure out each note to its listed volume: ${recipe.map(r => `${r.name} (${r.volume}ml)`).join(', ')}.`,
            'Combine notes in the vial starting with the Base note, then Heart, then Top.',
            'Gently swirl (do not shake) to combine.',
            'Let the blend rest for at least 24 hours before bottling for the customer.',
        ]
        mixingNotes = 'Store away from direct sunlight while settling.'
        }

        // ── STEP 10: Close the native MongoDB connection ───────
        // Always close the native client when done — unlike Mongoose,
        // MongoClient doesn't cache connections automatically
        await client.close()

        // ── STEP 11: Send the full response ───────────────────
        // mixingInstructions matches the shape the admin order detail
        // page already renders (blendName, totalVolume, recipe, steps, notes)
        const mixingInstructions = {
        blendName: perfumeName,
        totalVolume: `${totalVolume}ml`,
        totalVolumeMl: totalVolume, // raw number, for calculations/display math
        recipe: recipe.map(r => ({
            emoji: r.emoji,
            role: r.role,
            note: r.name,
            category: r.category,
            color: r.color,
            imageUrl: r.imageUrl,
            volume: `${r.volume}ml`,
            volumeMl: r.volume,       // raw number
            percentage: `${r.percentage}%`,
            percentageNum: r.percentage, // raw number
        })),
        steps,
        notes: mixingNotes,
        }

        return NextResponse.json(
        {
            success: true,
            perfumeName,
            scentDescription,
            mixingInstructions,
            pricing: {
            fragranceCost: Number(fragranceCost.toFixed(2)),
            mixingFee,
            vialCost,
            totalAmount: Number(totalAmount.toFixed(2)),
            },
        },
        { status: 200 }
        )

    } catch (error) {
        // Make sure we close the native client even if something crashes
        if (client) await client.close()

        console.error('POST /api/ai/describe-match error:', error)
        return NextResponse.json(
        {
            success: false,
            message: 'Something went wrong with the AI matching',
            error: error.message,
        },
        { status: 500 }
        )
    }
}