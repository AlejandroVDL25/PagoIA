import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/admin-auth"

/** Permite escribir el catálogo con el token interno (scripts) o con una sesión de administrador (panel). */
async function isAuthorizedAdmin(req: NextRequest): Promise<boolean> {
  const internalToken = req.headers.get("x-internal-token")
  if (internalToken && process.env.INTERNAL_API_TOKEN && internalToken === process.env.INTERNAL_API_TOKEN) {
    return true
  }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return isAdminUser(user)
  } catch {
    return false
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: services, error } = await supabase
      .from("services")
      .select("*")
      .eq("is_active", true)
      .order("name")

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(services)
  } catch (error) {
    console.error("Error fetching services:", error)
    return NextResponse.json(
      { error: "Failed to fetch services" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorizedAdmin(req))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json()
    const { name, description, category, icon, price, is_active } = body

    if (!name || !category) {
      return NextResponse.json(
        { error: "Missing required fields: name, category" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: service, error } = await supabase
      .from("services")
      .insert({
        name,
        description,
        category,
        icon,
        price: price || 0,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(service, { status: 201 })
  } catch (error) {
    console.error("Error creating service:", error)
    return NextResponse.json(
      { error: "Failed to create service" },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!(await isAuthorizedAdmin(req))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json()
    const { id, name, description, category, icon, price, is_active } = body

    if (!id) {
      return NextResponse.json(
        { error: "Missing service ID" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: service, error } = await supabase
      .from("services")
      .update({
        name,
        description,
        category,
        icon,
        price,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(service)
  } catch (error) {
    console.error("Error updating service:", error)
    return NextResponse.json(
      { error: "Failed to update service" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await isAuthorizedAdmin(req))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Missing service ID" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting service:", error)
    return NextResponse.json(
      { error: "Failed to delete service" },
      { status: 500 }
    )
  }
}
